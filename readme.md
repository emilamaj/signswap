# Gasless DEX - L1 signature-based decentralized exchange on Ethereum

This project aims to build a decentralized exchange (DEX) built on Ethereum L1. It provides drastically reduced fees compared to other DEXs, at the cost of delayed execution of trades.
Swaps are not guaranteed to execute, but if they do, they are guaranteed to execute at the price and conditions specified by the user.
The user never pays the fees for execution, they are paid by the protocol.
Currently, fees must be paid for token spending approval.
Gasless approval will be implemented in the future (EIP-2612 permit).

The core of the protocol is the **matching trades execution smart contract** OrderBookExchange.sol
The contract swaps two users tokens atomically **if and only if** the swaps are realized under the conditions specified by the users. To guarantee this, the contract checks the cryptographic signatures associated with the orders.
This signature is issued by the user's wallet, and covers all the parameters of the trade (amount, price, slippage, expiration, etc.).

These signed trade orders are stored on the backend of the protocol, and an engine tries to match them to one another. If a match is found, the contract is called to execute the trade.
If no match is found before the expiration of the order, the order is discarded, as nothing can be done with it.

The code is articulated in 3 main parts:
- The Solidity smart contracts, which is the core of the protocol, in the `contracts` folder. Forge is used to test and deploy the contracts.
- The UI, which is a React app, in the `ui` folder. It is where users interact with the protocol.
- The backend, which is a Node.js app, in the `api` folder. It is where the orders are stored and matched.

# Running the code

## Smart contracts
The smart contracts are written in solidity.

### Pre-requisites
To build the smart contracts and to deploy them, you need to install [Foundry](https://book.getfoundry.sh/) which is a modern Rust-based smart contract development framework.
To install **Foundry**, you need to install it by running the following command in Bash, Git Bash, or WSL (for Windows users):

```bash
curl -L https://foundry.paradigm.xyz | bash
```

You will then to initialize the smart contract project by running the following command:

```bash
forge init --force
forge install openzeppelin/openzeppelin-contracts
```

### Testing
To test the smart contracts, you need to run the following command:

```bash
forge test -vv
```
Forge will automatically run every test file in the `tests` folder (test files must be named `*.t.sol`).

### Deployment
A deployment script has been made. When run, it 
To deploy the smart contract locally, first run the local node using the following command:

```bash
anvil
```

Then, in another terminal, run the following command to deploy the smart contract:

```bash
forge script script/Deploy.s.sol:DeployContract --rpc-url local --broadcast -vv 
```

