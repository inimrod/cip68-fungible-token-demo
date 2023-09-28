import { Tx, Signature } from "@hyperionbt/helios";
import pkg from '@stricahq/bip32ed25519';
import { blake2b } from "blakejs";

type PrivateKey = pkg.PrivateKey;

function hash32(data: any) {
    const hash = blake2b(data, undefined, 32);
    return Buffer.from(hash);
};
function sign(privKey:PrivateKey, txHash: Buffer){
    const pubkey = privKey.toPublicKey().toBytes();
    const signature = privKey.sign(txHash);
    return new Signature([...pubkey], [...signature]);
}

export function getWitness(tx: Tx, privKey:PrivateKey, vars:any): Signature | undefined {
    const txBodyCbor = tx.body.toCborHex();
    const txBody = Buffer.from(txBodyCbor, 'hex');
    const txHash = hash32(txBody);
    return sign(privKey, txHash);
}