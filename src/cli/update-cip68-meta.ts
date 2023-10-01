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

// build tx
const tx = new Tx();

// inputs
tx.addInputs(vars.txInputs);


/* --------------------------------------------------------------
 * outputs
 * -------------------------------------------------------------- */
// cip68 ref token output (only needed once)
// note: it is good practice to lock this token into its own script address
//       in order to avoid spending this UTXO and losing the ref datum info.

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


/* --------------------------------------------------------------
 * finalize and submit
 * -------------------------------------------------------------- */
// finalize:
await tx.finalize(vars.networkParams, vars.changeAddr);

// sign
const txMakerWitness = getWitness(tx, vars.seedAcct.spendingPrivKey, vars) as Signature;
tx.addSignature(txMakerWitness);

const txId = await submitTx(tx);
console.log("metadata update tx successfully submitted!");
console.log("txId: ", txId);
// txId: 