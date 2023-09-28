import dotenv from "dotenv";
dotenv.config();
import fs from "fs";
import path from "path";
import { fetchTokenUtxo } from "./fetch-token-utxo.js";
import { getAcctDetails } from "./acct-details.js";
import {
    Address,
    TxInput, 
    NetworkParams, 
    Value,
    RemoteWallet, 
    WalletHelper,
    Program,
    textToBytes,
    bytesToHex,
    hexToBytes,
    BlockfrostV0,
    AssetClass,
    ConstrData,
    MintingPolicyHash
} from "@hyperionbt/helios";

export async function getInitVars(returnAddr: null | Address = null) {
    const version = "1.0";
    const optimize =  false;

    // set network
    const network = process.env.ENVIRONMENT=="dev" ? "preprod" : "mainnet";
    process.env.networkName = network;
    
    // blockfrost API
    const bfrost = new BlockfrostV0(network, process.env.BLOCKFROST_API_KEY as string);

    // network params    
    const networkParams: NetworkParams = await bfrost.getParameters();

    // wallet stuff
    const seecAcctPhrase = process.env.SEED_ACCT_PHRASE as string;
    const seedAcct = await getAcctDetails(seecAcctPhrase, 0);
    const changeAddr = returnAddr ? returnAddr : seedAcct.spendingAddr;
    const txInputs: TxInput[] = await bfrost.getUtxos(changeAddr);
    const remoteWallet = new RemoteWallet(network=="mainnet", [changeAddr], [], txInputs);
    const walletHelper = new WalletHelper(remoteWallet);
    const initialUtxoVal = new Value(BigInt(1000000));
    const sortedUtxos = await walletHelper.pickUtxos(initialUtxoVal); // pick utxos totalling at least initialUtxoVal
    
    // ------------------------
    // Helios validators stuff
    // ------------------------
    console.log('\n=========== Plutus scripts stuff ===========');
    // threadTokenPolicy script (MPH)
    const threadTokenNameStr = "tokenSupplyState";
    const seedUtxo = sortedUtxos[0][0];
    const rawScriptThreadToken = fs.readFileSync(path.resolve('src/contracts/threadTokenPolicy.hl')); // buffer
    const threadTokenProgram = Program.new(rawScriptThreadToken.toString());
    threadTokenProgram.parameters.seedTxId = seedUtxo.outputId.txId.hex; 
    threadTokenProgram.parameters.seedTxIx = seedUtxo.outputId.utxoIdx;
    const threadTokenCompiledProgram = threadTokenProgram.compile(optimize);
    let threadTokenPolicyHash: MintingPolicyHash;
    const existingThreadNftMPH = process.env.THREAD_NFT_MPH;
    if (existingThreadNftMPH){
        threadTokenPolicyHash = MintingPolicyHash.fromHex(existingThreadNftMPH);
    } else {
        threadTokenPolicyHash = threadTokenCompiledProgram.mintingPolicyHash;
    }    
    console.log('threadTokenPolicyHash:   ', threadTokenPolicyHash.hex);

    // supplyStateValidator script
    const rawScriptStateValidator = fs.readFileSync(path.resolve('src/contracts/supplyStateValidator.hl')); // buffer
    const supplyStateProgram = Program.new(rawScriptStateValidator.toString());
    supplyStateProgram.parameters.adminPkh = seedAcct.spendingKeyHash.hex;
    supplyStateProgram.parameters.threadTokenMPH = threadTokenPolicyHash.hex;
    const supplyStateCompiledProgram = supplyStateProgram.compile(optimize);
    const supplyStateValidatorHash = supplyStateCompiledProgram.validatorHash;
    const supplyStateValidatorAddr = Address.fromHashes(supplyStateValidatorHash, seedAcct.stakingKeyHash);

    // mainTokenPolicy script (MPH)
    const mainTokenNameHex = bytesToHex(textToBytes("DigAss"));
    const mainTokenCip68Ref_hexStr = "000643b0" + mainTokenNameHex
    const mainTokenCip68Usr_hexStr = "0014df10" + mainTokenNameHex;
    const rawScriptMainToken = fs.readFileSync(path.resolve('src/contracts/mainTokenPolicy.hl')); // buffer
    const mainTokenProgram = Program.new(rawScriptMainToken.toString());
    mainTokenProgram.parameters.supplyStateValidatorHash = supplyStateValidatorHash.hex;
    mainTokenProgram.parameters.adminPkh = seedAcct.spendingKeyHash.hex;
    mainTokenProgram.parameters.refTokenName = mainTokenCip68Ref_hexStr;
    mainTokenProgram.parameters.userTokenName = mainTokenCip68Usr_hexStr;
    mainTokenProgram.parameters.threadTokenMPH = threadTokenPolicyHash.hex;    
    const mainTokenCompiledProgram = mainTokenProgram.compile(optimize);
    const mainTokenPolicyHash = mainTokenCompiledProgram.mintingPolicyHash;
    console.log('mainTokenPolicyHash:     ', mainTokenPolicyHash.hex);

    console.log(`supplyStateValidatorAddr: ${supplyStateValidatorAddr.toBech32()}`);
    console.log('--------------------------------------------');
    console.log('');    

    /* MEMO: To get the following hex names, concatenate the cip68 label in hex, with the token name
     * (100) = 000643b0 for the reference token
     * (333) = 0014df10 for the user token
     * DigAss = 446967417373 the token name
     * 
     * To convert the decimal labels to hex, use: https://www.rapidtables.com/convert/number/decimal-to-hex.html
     * get the 4-digit hex equivalent. Ex: '0064' for 100
     * To get the CRC-8 checksum for the label's hex value, use https://crccalc.com/
     * grab CRC-8 result and drop the '0x', use the last 2 chars. Ex: '3b' for 0064
     * concatenate the hex and the crc-8 checksum. Ex: '00643b'
     * then add '0' to the beginning and end. Ex: '000643b0'
     */
    const TN_mainRefTokenCip68 = hexToBytes(mainTokenCip68Ref_hexStr); // 000643b0446967417373 
    const TN_mainUsrTokenCip68 = hexToBytes(mainTokenCip68Usr_hexStr); // 0014df10446967417373
    const TN_threadToken = textToBytes(threadTokenNameStr);

    const assetClass_cip68Ref = AssetClass.fromProps({"mph":mainTokenPolicyHash, "tokenName": TN_mainRefTokenCip68});
    const assetClass_cip68Usr = AssetClass.fromProps({"mph":mainTokenPolicyHash, "tokenName": TN_mainUsrTokenCip68});
    const assetClass_supplyState = AssetClass.fromProps({"mph":threadTokenPolicyHash, "tokenName": TN_threadToken});


    // fetch thread and ref tokens utxos:
    // ----------------------------------
    // supplyState
    const supplyStateTokenStr = `${threadTokenPolicyHash.hex}${bytesToHex(textToBytes(threadTokenNameStr))}`;
    const supplyStateUtxo = await fetchTokenUtxo(supplyStateTokenStr);
    // ref token
    const cip68RefTokenStr = `${mainTokenPolicyHash.hex}${mainTokenCip68Ref_hexStr}`;
    const cip68RefTokenUtxo = await fetchTokenUtxo(cip68RefTokenStr);

    // get current supply:
    const mainTokenCurrentSupply = !supplyStateUtxo ? 0 : (supplyStateUtxo as TxInput).dump().output.datum.inlineSchema.list[3].int as number;

    // dummy datum/redeemer data:
    const dummyPlutusData = new ConstrData(0, []);

    
 
    return {
        version,
        optimize,
        network,
        bfrost,
        networkParams,
        txInputs,
        seedAcct,
        changeAddr,
        remoteWallet,
        walletHelper,
        initialUtxoVal,
        sortedUtxos,
        existingThreadNftMPH,
        threadTokenProgram,
        threadTokenCompiledProgram,
        threadTokenPolicyHash,
        mainTokenProgram,
        mainTokenCompiledProgram,
        mainTokenPolicyHash,
        supplyStateProgram,
        supplyStateCompiledProgram,
        supplyStateValidatorHash,
        supplyStateValidatorAddr,        
        supplyStateUtxo,
        cip68RefTokenUtxo,
        mainTokenCurrentSupply,
        TN_mainRefTokenCip68,
        TN_mainUsrTokenCip68,
        TN_threadToken,
        mainTokenCip68Ref_hexStr,
        mainTokenCip68Usr_hexStr,
        assetClass_cip68Ref,
        assetClass_cip68Usr,
        assetClass_supplyState,
        dummyPlutusData
    };
}