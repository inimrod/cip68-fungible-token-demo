import { BlockFrostAPI } from '@blockfrost/blockfrost-js';
import { 
    TxOutputId,
    TxOutput,
    TxInput,
    TxId,
    UplcProgram,
    Address,
    Datum,
    UplcData,
    hexToBytes,
    Value,
    MintingPolicyHash,
    Assets
} from "@hyperionbt/helios";

export async function fetchTokenUtxo(token: string){
    console.log(`fetching last utxo of token (${Buffer.from(token.substring(56), 'hex').toString()}):`)
    console.log(token);
    const apiKey: string = process.env.BLOCKFROST_API_KEY as string;
    const client = new BlockFrostAPI({projectId: apiKey});
    try {
        const tokenTxs = await client.assetsTransactions(token, {order: "desc", count: 1});
        const lastTx = tokenTxs[0]; // don't trust bfrost's .tx_index returned here! inconsistent
        const txOutputs = (await client.txsUtxos(lastTx.tx_hash)).outputs;
        const targetUtxo:any = txOutputs.filter(output => output.amount.some(amt => amt.unit == token))[0];
        targetUtxo["tx_hash"] = lastTx.tx_hash as string;
        const rebuiltTxInput = await restoreTxInput(targetUtxo);
        return rebuiltTxInput;
    } catch (e) {
        if (404 == (e as unknown as Record<string, any>)?.status_code){
            console.log(`Nothing found.`);
            return false;
        } 
        throw e;
    }
}

/**
 * @param {{
 *   address: string
 *   tx_hash: string
 *   output_index: number
 *   amount: {unit: string, quantity: string}[]
 *   inline_datum: null | string
 *   data_hash: null | string
 *   collateral: boolean
 *   reference_script_hash: null | string
 * }} obj 
 * (Taken straight from Helios internal functions)
 */
async function restoreTxInput(obj:any) {
   /**
    * @type {null | UplcProgram}
    */
   let refScript: UplcProgram | null = null;
   if (obj.reference_script_hash !== null) {
       const url = `https://cardano-${process.env.networkName}.blockfrost.io/api/v0/scripts/${obj.reference_script_hash}/cbor`;

       const response = await fetch(url, {
           method: "GET",
           headers: {
               "project_id": process.env.BLOCKFROST_API_KEY as string
           }
       });

       const cbor = (await response.json()).cbor;

       refScript = UplcProgram.fromCbor(cbor);
   }

   return new TxInput(
       new TxOutputId(TxId.fromHex(obj.tx_hash), obj.output_index),
       new TxOutput(
           Address.fromBech32(obj.address),
           parseValue(obj.amount),
           obj.inline_datum ? Datum.inline(UplcData.fromCbor(hexToBytes(obj.inline_datum))) : null,
           refScript
       )
   );
}

/**
 * @param {{unit: string, quantity: string}[]} obj
 * @returns {Value}
 * (Taken straight from Helios internal functions)
 */
function parseValue(obj:any) {
    let value = new Value();

    for (let item of obj) {
        let qty = BigInt(item.quantity);

        if (item.unit == "lovelace") {
            value = value.add(new Value(qty));
        } else {
            let policyID = item.unit.substring(0, 56);
            let mph = MintingPolicyHash.fromHex(policyID);

            let token = hexToBytes(item.unit.substring(56));

            value = value.add(new Value(0n, new Assets([
                [mph, [
                    [token, qty]
                ]]
            ])));
        }
    }

    return value;
}