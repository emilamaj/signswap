// Node.js script to run the complete project.
// require('dotenv').config();

// Check if -dev flag is present
var isDev = process.argv.indexOf('-dev') > -1;

// Run Foundry deploy scripts
if (isDev) {
    /*
    Deploy the smart contracts to the local node.
    - Run anvil local node
    - Deploy the smart contracts
    - Deploy 
    
    Run the following linux commands in sequence:
    anvil
    forge script script/DeployExchange.s.sol:DeployExchange --rpc-url local --broadcast -vv 
    forge script script/DeployTrade.s.sol:DeployTrade --rpc-url local --broadcast -vv 
    forge script script/DeployTokens.s.sol:DeployTokens --rpc-url local --broadcast -vv 
    */

    // Run the commands
    var exec = require('child_process').exec;
    var cmd_arr = [
        'anvil',
        'forge script script/DeployExchange.s.sol:DeployExchange --rpc-url local --broadcast -vv',
        'forge script script/DeployTrade.s.sol:DeployTrade --rpc-url local --broadcast -vv',
        'forge script script/DeployTokens.s.sol:DeployTokens --rpc-url local --broadcast -vv'
    ];
    var cmd = cmd_arr.join(' && ');
    console.log(cmd);
    var child = exec(cmd, function(error, stdout, stderr) {
        console.log(stdout);
    });
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);

} else {
    // Check if the contracts are deployed to the mainnet. If not, deploy them.

    // Check if envdata contains the mainnet addresses
    //...

    // Check wether contracts are deployed to the mainnet addresses
    //...

    // If not, deploy them
    //...
}

// Run the ui
if (isDev){
    // Run the ui in dev mode
    // Go to the ui folder
    // Execute the following commands:
    // Run npm start

    // Run the commands
    var exec = require('child_process').exec;
    var cmd_arr = [
        'cd ui',
        'npm start'
    ];
    var cmd = cmd_arr.join(' && ');
    console.log(cmd);
    var child = exec(cmd, function(error, stdout, stderr) {
        console.log(stdout);
    });
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
} else {
    // Run the ui in production mode
    //...
}

// Run the backend api
if (isDev){
    // Run the backend api
    // Go to the "api" folder
    // Execute the following commands:
    // node server.js

    // Run the commands
    var exec = require('child_process').exec;
    var cmd_arr = [
        'cd api',
        'node server.js'
    ];
    var cmd = cmd_arr.join(' && ');
    console.log(cmd);
    var child = exec(cmd, function(error, stdout, stderr) {
        console.log(stdout);
    });
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);
} else {
    // Run the backend api in production mode
    //...
}

