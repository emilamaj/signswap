// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;
/////////////////////////
// This script is used to deploy the internal order trading smart contract (InternalTrade.sol).

import "../lib/forge-std/src/Script.sol";
import "../lib/forge-std/src/console.sol";
import "../src/InternalTrade.sol";
import "../lib/openzeppelin-contracts/contracts/utils/Strings.sol";

contract DeployScript is Script {
    function run() public {
        console.log("Deploying trade contract...");
        uint256 deployerPrivateKey = vm.envUint("EOA_PRIVATE_KEY");
        address deployerAddress = vm.envAddress("EOA_ADDRESS");
        // console.log("Deployer private key: ", deployerPrivateKey);

        // Deploy the contract
        /////////////////////////////
        // NOTE 1: Sometimes, the deployment fails for unknown reasons. To redeploy, the nonce of the transcation needs to be bumped by 1.
        // vm.setNonce(address(this), vm.getNonce(address(this)) + 1);
        /////////////////////////////
        vm.startBroadcast(deployerPrivateKey);
        InternalTrade internalTradeContract = new InternalTrade(deployerAddress);
        vm.stopBroadcast();



        // Output data
        // Print the contract address
        console.log("Internal Trade Contract address: ", address(internalTradeContract));
        // - Trade contract address
        /* Create a trade_contract.txt file with only the following content:
        0x0ABC...
        The file will be located in /contracts/trade_contract.txt */
        console.log("Writing trade contract address to: ./trade_contract.txt");
        string memory path3 = "./trade_contract.txt"; // The path is relative to the root of the project folder.
        string memory data3 = Strings.toHexString(uint256(uint160(address(internalTradeContract))), 20);
        vm.writeFile(path3, data3);

        //NOTE Sometimes, the deployment fails for unknown reasons, and to redeploy, the nonce of the transcation needs to be bumped by 1.
        console.log("If the transaction fails for 'gas underpriced' reasons, uncomment the line after 'NOTE 1'.");
    }
}
