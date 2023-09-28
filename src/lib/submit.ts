import { BlockFrostAPI } from '@blockfrost/blockfrost-js';
import { Tx } from "@hyperionbt/helios";

export async function submitTx(tx: Tx): Promise<string> {
    const payload = new Uint8Array(tx.toCbor());
    const apiKey: string = process.env.BLOCKFROST_API_KEY as string;
    try {
        const client = new BlockFrostAPI({
            projectId: apiKey,
        });
        const txHash = await client.txSubmit(payload);
        return txHash;
    }
    catch (err) {
        console.error("signSubmitTx API Failed: ", err);
        throw err;
    }
}