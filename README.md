# Cardano Cip68 Fungible Token Demo

A sample Cardano CIP-68 fungible token implemented with [Helios](https://www.hyperion-bt.org/helios-book/).

## Requires:
node v17.5 or later because of `fetch` api used by [Helios](https://www.hyperion-bt.org/helios-book/), preferably v18.

## Prep:
1. Get your Blockfrost API key at https://blockfrost.io/
1. Prepare an account to be used as the admin and transaction maker. Make sure you have ADA on the first base address of the first account generated from the seed phrase you will use here `(m/1852'/1815'/0'/0/0)`.
1. Fill in the variables in the .env file.
1. run `yarn install`

## Mint tokens:
1. Set the amount to mint in the .env file
1. Run command `yarn mint-tokens`

## Note
Always run scripts from project root directory because env vars and fs.read params in modules are referenced relative to the root directory.


## Author
Nimrod Flores / [Staking Rocks! [PHRCK]](https://staking.rocks) Cardano stake pool

https://staking.rocks

## License
MIT