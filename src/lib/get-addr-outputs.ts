import {
    Tx,
    Address,
    TxInput,
    TxOutputId,
    TxOutputIdProps
} from "@hyperionbt/helios";

export function getAddressOutputs(tx: Tx, returnAddr: Address): TxInput[]{
    const txId = tx.id();
    const outputs = tx.body.outputs;
    const returnOutputs: TxInput[] = [];
    for (let [idx, output] of Object.entries(outputs) ){
        if (output.address.eq(returnAddr)) {
            returnOutputs.push(
                new TxInput(
                    new TxOutputId(`${txId}#${idx}` as TxOutputIdProps),
                    output
                )
            );
        }
    }
    return returnOutputs;
}