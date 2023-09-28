import fs from "fs";
import path from "path";
import { getInitVars } from './init-vars.js';
import { getWitness } from './get-witness.js';
import { submitTx } from './submit.js';
import { getAddressOutputs } from './get-addr-outputs.js';
import {
    Datum,
    Tx,
    TxOutput,
    Value,
    Signature,
    Assets
} from "@hyperionbt/helios";

type Vars = Awaited<ReturnType<typeof getInitVars>>;
const envPath = path.join(process.cwd(), ".env");

export async function initializeSuppyState(vars: Vars){
    // build tx
    const tx = new Tx();

    // create empty redeemer for threadToken because we must always send a Redeemer in
    // a plutus script transaction even if we don't actually use it.
    const threadTokenMintRedeemer = vars.dummyPlutusData; // new ConstrData(0, []);

    // add mint of the thread token:
    tx.mintTokens(
        vars.threadTokenPolicyHash,
        [
            [vars.TN_threadToken, BigInt(1)]
        ],
        threadTokenMintRedeemer
    )

    // add thread token minting script:
    tx.attachScript(vars.threadTokenCompiledProgram);

    // create initial supplyState Datum:
    const initSupplyStateDatum = new vars.supplyStateProgram.types.Datum(
        vars.assetClass_cip68Ref,
        vars.assetClass_cip68Usr,
        BigInt(0),
        BigInt(0)
    )._toUplcData();

    // add output (supply state thread token):
    const supplyStateAssets = new Assets([[vars.assetClass_supplyState, BigInt(1)]]);
    const supplyStateOutput = new TxOutput(
        vars.supplyStateValidatorAddr,
        new Value(undefined, supplyStateAssets),
        Datum.inline(initSupplyStateDatum)
    );
    tx.addOutput(supplyStateOutput);

    // add inputs:
    tx.addInputs(vars.sortedUtxos[0]);

    // add admin signer
    tx.addSigner(vars.seedAcct.spendingKeyHash);

    // finalize:
    await tx.finalize(vars.networkParams, vars.changeAddr, vars.sortedUtxos[1]);

    // -------------------------------------
    // sign tx:
    // -------------------------------------
    const adminWitness = getWitness(tx, vars.seedAcct.spendingPrivKey, vars) as Signature;
    tx.addSignature(adminWitness);

    // -------------------------------------
    // get outputs for use in the next tx:
    // -------------------------------------
    const returnOutputs = getAddressOutputs(tx, vars.seedAcct.spendingAddr);
    const scriptOutputs = getAddressOutputs(tx, vars.supplyStateValidatorAddr);

    // -------------------------------------
    // submit tx:
    // -------------------------------------
    const txId = await submitTx(tx);
    console.log("init state tx submitted!");
    console.log("txId: ", txId);

    // Update env vars: (from https://stackoverflow.com/a/74758228/1481762)
    const env = fs.readFileSync(envPath).toString().split(/\r?\n/g);
    for(let lineNo in env) {
        if(env[lineNo].startsWith("THREAD_NFT_MPH=")) {
            env[lineNo] = `THREAD_NFT_MPH=${vars.threadTokenPolicyHash.hex}`;
        }
    }
    const newEnv = env.join("\n");
    fs.writeFileSync(envPath, newEnv);
    console.log(`\n.env file updated with thread NFT MPH\n`);
    // also update the env vars in the current running instance:
    process.env.THREAD_NFT_MPH = vars.threadTokenPolicyHash.hex;

    return {
        returnOutputs,
        scriptOutputs
    }
}
