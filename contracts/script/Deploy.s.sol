// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../lib/forge-std/src/Script.sol";
import "../lib/forge-std/src/console.sol";
import "../src/OrderBookExchange.sol";
import "../lib/openzeppelin-contracts/contracts/utils/Strings.sol";

contract DeployScript is Script {
    function run() public {
        
        uint256 deployerPrivateKey = vm.envUint("EOA_PRIVATE_KEY");
        console.log("Deployer private key: ", deployerPrivateKey);

        // Deploy the contract
        /////////////////////////////
        // NOTE 1: Sometimes, the deployment fails for unknown reasons. To redeploy, the nonce of the transcation needs to be bumped by 1.
        // vm.setNonce(address(this), vm.getNonce(address(this)) + 1);
        /////////////////////////////
        vm.startBroadcast(deployerPrivateKey);
        OrderBookExchange exchangeContract = new OrderBookExchange();
        vm.stopBroadcast();

        // Copy the output JSON file (containing the ABI) to the frontend and api folders.
        // The file is in /contracts/out/OrderBookExchange.sol/OrderBookExchange.json
        // Move to /api/abi/OrderBookExchange.json and /ui/public/abi/OrderBookExchange.json
        // string memory pathFrom = "./out/OrderBookExchange.sol/OrderBookExchange.json"; // The path is relative to the root of the project folder.
        // string memory pathTo1 = "../api/abi/OrderBookExchange.json"; // The path is relative to the root of the project folder.
        // Waste of time


        // Backend environment variables
        /*Create a .env file with the following content:
        PORT=3090
        NODE_RPC_URL=http://localhost:8545
        CONTRACT_ADDRESS=0x0
        EOA_PRIVATE_KEY=0xpk

        The file will be located in /api/.env */
        string memory path = "../api/.env"; // The path is relative to the root of the forge project folder.
        string memory data = "";
        data = string(abi.encodePacked(data, "PORT=")); // Append vm.envUint("API_PORT");
        data = string(abi.encodePacked(data, Strings.toString(vm.envUint("API_PORT"))));
        data = string(abi.encodePacked(data, "\nNODE_RPC_URL=")); // Append vm.envString("NODE_RPC_URL");
        data = string(abi.encodePacked(data, vm.envString("NODE_RPC_URL")));
        data = string(abi.encodePacked(data, "\nCONTRACT_ADDRESS=")); // Append Strings.toHexString(uint256(uint160(address(exchangeContract))), 20);
        data = string(abi.encodePacked(data, Strings.toHexString(uint256(uint160(address(exchangeContract))), 20)));
        data = string(abi.encodePacked(data, "\nEOA_PRIVATE_KEY=")); // Append vm.envString("PROTOCOL_EOA_PK");
        data = string(abi.encodePacked(data, vm.envString("EOA_PRIVATE_KEY")));
        vm.writeFile(path, data);


        // Frontend environment variables
        /*Create a .env file with the following content:
        REACT_APP_PORT=3000
        REACT_APP_API_URL=http://localhost:3000
        REACT_APP_NODE_RPC_URL=http://localhost:8545
        REACT_APP_CONTRACT_ADDRESS=0x0ABC

        The file will be located in /ui/.env */
        string memory path2 = "../ui/.env"; // The path is relative to the root of the project folder.
        string memory data2 = ""; // Append vm.envUint("PORT");
        data2 = string(abi.encodePacked(data2, "REACT_APP_PORT="));
        data2 = string(abi.encodePacked(data2, Strings.toString(vm.envUint("UI_PORT"))));
        data2 = string(abi.encodePacked(data2, "\nREACT_APP_API_URL=")); // Append vm.envString("API_URL") + ":" + Strings.toString(vm.envUint("API_PORT"));
        data2 = string(abi.encodePacked(data2, vm.envString("API_URL")));
        data2 = string(abi.encodePacked(data2, ":"));
        data2 = string(abi.encodePacked(data2, Strings.toString(vm.envUint("API_PORT"))));
        data2 = string(abi.encodePacked(data2, "\nREACT_APP_NODE_RPC_URL=")); // Append vm.envString("NODE_RPC_URL");
        data2 = string(abi.encodePacked(data2, vm.envString("NODE_RPC_URL")));
        data2 = string(abi.encodePacked(data2, "\nREACT_APP_CONTRACT_ADDRESS=")); // Append Strings.toHexString(uint256(uint160(address(exchangeContract))), 20);
        data2 = string(abi.encodePacked(data2, Strings.toHexString(uint256(uint160(address(exchangeContract))), 20)));
        vm.writeFile(path2, data2);


        // Forge usage
        /* Create a contract.txt file with the following content:
        0x0ABC...
        
        The file will be located in /contracts/contract.txt */
        string memory path3 = "./contract.txt"; // The path is relative to the root of the project folder.
        string memory data3 = Strings.toHexString(uint256(uint160(address(exchangeContract))), 20);
        vm.writeFile(path3, data3);

        // Print the contract address
        console.log("Contract address: ", address(exchangeContract));

        //NOTE Sometimes, the deployment fails for unknown reasons, and to redeploy, the nonce of the transcation needs to be bumped by 1.
        console.log("If the transaction fails for 'gas underpriced' reasons, uncomment the line after 'NOTE 1'.");
    }
}
