import { mnemonicToEntropy } from 'bip39';
import pkg from '@stricahq/bip32ed25519';
const { Bip32PrivateKey } = pkg;
import {
    Address,
    StakeAddress,
    PubKeyHash
} from "@hyperionbt/helios";

export async function getAcctDetails(phrase:string, idx: number){
    let isTestnet = process.env.ENVIRONMENT=="dev" ? true : false;

    const entropy = mnemonicToEntropy(phrase);
    const rootKey = await Bip32PrivateKey.fromEntropy(Buffer.from(entropy, "hex"));
    const accountKey = rootKey
        .derive(2147483648 + 1852) // purpose
        .derive(2147483648 + 1815) // coin type
        .derive(2147483648 + idx); // account index
    const stakingPrivKey = accountKey
        .derive(2) // chain {0: external, 1: internal, 2: staking key}
        .derive(0) // staking acct idx
        .toPrivateKey();
    const stakingKeyHash = PubKeyHash.fromProps( stakingPrivKey.toPublicKey().hash().toString("hex") );
    const stakingAddr = StakeAddress.fromHash(
        isTestnet,
        stakingKeyHash
    );
    const spendingPrivKey = accountKey
        .derive(0) // chain {0: external, 1: internal, 2: staking key}
        .derive(0) // spending addr idx
        .toPrivateKey();
    const spendingKeyHash = PubKeyHash.fromProps( spendingPrivKey.toPublicKey().hash().toString("hex") );
    const spendingAddr = Address.fromHashes(
        spendingKeyHash,
        stakingKeyHash,
        isTestnet
    )    

    return {
        stakingPrivKey,
        stakingKeyHash,
        stakingAddr,
        spendingPrivKey,
        spendingKeyHash,
        spendingAddr
    }
}