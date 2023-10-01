import { getInitVars } from '../lib/init-vars.js';
import { getWitness } from '../lib/get-witness.js';
import { initializeSuppyState } from '../lib/init-state.js';
import { submitTx } from '../lib/submit.js';
import {
    Datum,
    Tx,
    TxInput,
    TxOutput,
    Value,
    textToBytes,
    ConstrData,
    ByteArrayProps,
    ByteArrayData,
    HIntProps,
    IntData,
    MapData,
    Signature,
    Assets
} from "@hyperionbt/helios";

type Vars = Awaited<ReturnType<typeof getInitVars>>;
const vars:Vars = await getInitVars();

// Initialize state machine if not yet started
if (!vars.existingThreadNftMPH){
    const results = await initializeSuppyState(vars);
    vars.txInputs = results.returnOutputs;
    vars.supplyStateUtxo = results.scriptOutputs[0];
    console.log(`\nDone initializing the supply state machine.\n\n`);
}


// build tx
const tx = new Tx();


// mints
const mintAmt = process.env.MINT_AMT as unknown as number;
const tokensToMint:[ByteArrayProps, HIntProps][] = [ [vars.TN_mainUsrTokenCip68, BigInt(mintAmt)] ];
if (!vars.cip68RefTokenUtxo){
    tokensToMint.push([vars.TN_mainRefTokenCip68, BigInt(1)]);
}
tx.mintTokens(vars.mainTokenPolicyHash, tokensToMint, vars.dummyPlutusData);



// build updated supplyState Datum:
const updatedSupply = Number(mintAmt) + vars.mainTokenCurrentSupply;
const updatedSupplyStateDatum = new vars.supplyStateProgram.types.Datum(
    vars.assetClass_cip68Ref,
    vars.assetClass_cip68Usr,
    BigInt(1),
    BigInt(updatedSupply)
);

console.log(`\nmintAmt       :`, mintAmt);
console.log(`updated supply:`, updatedSupply);

// build supplyState Redeemer:
const stateSupplyRedeemer = new vars.supplyStateProgram.types.Redeemer.Mint();


// inputs
for (let input of vars.txInputs){
    // don't spend the UTXO containing the ref token datum
    if (! input.value.assets.has(vars.mainTokenPolicyHash, vars.TN_mainRefTokenCip68)) tx.addInput(input); 
}
if (vars.supplyStateUtxo) tx.addInput(vars.supplyStateUtxo as TxInput, stateSupplyRedeemer._toUplcData());


/* --------------------------------------------------------------
 * outputs
 * -------------------------------------------------------------- */
// supplyStateOutput
const supplyStateAsset = new Assets([ [vars.assetClass_supplyState, BigInt(1)] ]);
tx.addOutput(new TxOutput(
    vars.supplyStateValidatorAddr,
    new Value(undefined, supplyStateAsset),
    Datum.inline(updatedSupplyStateDatum._toUplcData())
));


// cip68 ref token output (only needed once)
// note: it is good practice to lock this token into its own script address
//       in order to avoid spending this UTXO and losing the ref datum info.
if (!vars.cip68RefTokenUtxo){
    // cip68 ref token datum:
    const nameKey = new ByteArrayData(textToBytes("name"));
    const nameValue = new ByteArrayData(textToBytes("Digital Asset"));
    const descKey = new ByteArrayData(textToBytes("description"));
    const descValue = new ByteArrayData(textToBytes("A very valuable Cardano native token"));
    const tickerKey = new ByteArrayData(textToBytes("ticker"));
    const tickerValue = new ByteArrayData(textToBytes("DigAss"));
    const urlKey = new ByteArrayData(textToBytes("url"));
    const urlValue = new ByteArrayData(textToBytes("https://staking.rocks"));
    const decimlsKey = new ByteArrayData(textToBytes("decimals"));
    const decimlsValue = new IntData(BigInt(6));
    const logoKey = new ByteArrayData(textToBytes("logo"));
    const logoValue = new ByteArrayData(textToBytes("ipfs://QmVb3oW3Ctsp6FmQdUpqPKJ6D1CJKsV1AgE1s8s8geuK94/DigAss.svg"));
    const mapData = new MapData([
        [nameKey, nameValue],
        [descKey, descValue],
        [tickerKey, tickerValue],
        [urlKey, urlValue],
        [decimlsKey, decimlsValue],
        [logoKey, logoValue]
    ]);
    const version = new IntData(BigInt(1));
    const refTokenDatum = new ConstrData(0, [mapData, version]);
    const cip68RefAsset = new Assets([ [vars.assetClass_cip68Ref, BigInt(1)] ]);
    tx.addOutput(new TxOutput(
        vars.seedAcct.spendingAddr,
        new Value(undefined, cip68RefAsset),
        Datum.inline(refTokenDatum)
    ));
}


// cip68 user token output
const cip68UsrAsset = new Assets([ [vars.assetClass_cip68Usr, BigInt(mintAmt)] ]);
tx.addOutput(new TxOutput(
    vars.seedAcct.spendingAddr,
    new Value(undefined, cip68UsrAsset)
));


/* --------------------------------------------------------------
 * minting and state validator scripts
 * -------------------------------------------------------------- */
// main token policy script
tx.attachScript(vars.mainTokenCompiledProgram);

// supply state validator script
tx.attachScript(vars.supplyStateCompiledProgram);


/* --------------------------------------------------------------
 * finalize and submit
 * -------------------------------------------------------------- */
// add admin signer (not really necessary if the tx maker acct is the same as the admin acct)
tx.addSigner(vars.seedAcct.spendingKeyHash);

// finalize:
await tx.finalize(vars.networkParams, vars.changeAddr);

// sign
const txMakerWitness = getWitness(tx, vars.seedAcct.spendingPrivKey, vars) as Signature;
tx.addSignature(txMakerWitness);

const txId = await submitTx(tx);
console.log("mint tx successfully submitted!");
console.log("txId: ", txId);
// txId: 