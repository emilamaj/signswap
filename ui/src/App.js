import React, { useState, useEffect } from 'react';
import Web3 from 'web3';
import { Button, TextField, Container, Typography, Stack } from '@mui/material';
import './App.css';
import IconSwitch from './components/IconSwitch';
import IconShow from './components/IconShow';
import TokenInput from './components/TokenInput';
import IconGithub from './components/IconGithub';
import IconEtherscan from './components/IconEtherscan';

const web3 = new Web3(Web3.givenProvider);
const bn = (n) => Web3.utils.toBN(n);

// Token Data
const WETH = {
	chainId: 1,
	address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
	name: "Wrapped Ether",
	symbol: "WETH",
	decimals: 18,
	logoURI: "https://assets.coingecko.com/coins/images/2518/thumb/weth.png?1628852295"
};
const DAI = {
	chainId: 1,
	address: "0x6b175474e89094c44da98b954eedeac495271d0f",
	name: "Dai",
	symbol: "DAI",
	decimals: 18,
	logoURI: "https://assets.coingecko.com/coins/images/9956/thumb/Badge_Dai.png?1687143508"
};

// Web3 Initialization
const exchangeContractAddress = process.env.REACT_APP_EXCHANGE_CONTRACT_ADDRESS; // Add your contract address here
const UniswapV2FactoryAddress = "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f";
let exchangeContractABI; // Read the abi from /public/abi/OrderBookExchange.json
let erc20ABI; // Read the abi from /public/abi/ERC20.json
let exchangeContract;
let factoryContract;
let factoryContractABI; // Read the abi from /public/abi/UniswapV2Factory.json
let pairContractABI; // Read the abi from /public/abi/UniswapV2Pair.json
// Defer contract creation until ABI is loaded
fetch('/abi/OrderBookExchange.json').then((response) => response.json()).then((data) => {
	exchangeContractABI = data.abi;
	exchangeContract = new web3.eth.Contract(exchangeContractABI, exchangeContractAddress);
});
fetch('/abi/ERC20.json').then((response) => response.json()).then((data) => {
	erc20ABI = data.abi;
});
fetch('/abi/UniswapV2Factory.json').then((response) => response.json()).then((data) => {
	factoryContractABI = data;
	factoryContract = new web3.eth.Contract(factoryContractABI, UniswapV2FactoryAddress);
});
fetch('/abi/UniswapV2Pair.json').then((response) => response.json()).then((data) => {
	pairContractABI = data;
});


function App() {
	// Functional state
	const [isAdvanced, setIsAdvanced] = useState(false);
	// Form inputs
	const [account, setAccount] = useState('');
	const [tokenA, setTokenA] = useState(WETH);
	const [tokenB, setTokenB] = useState(DAI);
	const [minAmountA, setMinAmountA] = useState(''); // Ignore token decimals in App.js, convert to correct integer in handleSubmit()
	const [maxAmountA, setMaxAmountA] = useState('');
	const [price, setPrice] = useState('');
	const [maxSlippage, setMaxSlippage] = useState('');
	const [expiration, setExpiration] = useState('');
	// App data
	const [decimals, setDecimals] = useState({});
	const [tokenList, setTokenList] = useState([]);

	// Find decimals of tokenA
	const getDecimals = async (tokenAddress) => {
		// Check if not already loaded
		const storedValue = decimals[tokenAddress];
		if (storedValue === undefined) {
			const tokenContract = new web3.eth.Contract(erc20ABI, tokenAddress);
			const decimals = await tokenContract.methods.decimals().call();
			setDecimals({ ...decimals, [tokenAddress]: decimals });
			return decimals;
		} else {
			return storedValue;
		}
	}

	// Connect wallet if not already connected
	const loadAccount = async () => {
		if (account) {
			console.log("Account already loaded: ", account)
			return account;
		} else {
			console.log("Connecting wallet...")
			if (window.ethereum) {
				console.log("Wallet found. Enabling...")
				const accs = await window.ethereum.enable();
				console.log("Loaded account: ", accs[0])
				setAccount(accs[0]);
				return accs[0];
			} else {
				console.log("No wallet found")
			}

		}

		return null;
	};

	// Approve contract to spend tokens of userA and userB
	const handleApprove = async (e) => {
		e.preventDefault(); // Prevent the page from reloading
		console.log("Approving tokens...")

		// Load wallet if not already loaded
		let loadedAccount = await loadAccount();
		if (!loadedAccount) {
			console.log("Cannot approve, no wallet found");
			return;
		}

		// Load token contract
		const tokenContractA = new web3.eth.Contract(erc20ABI, tokenA.address);

		// Approve contract to spend tokens (max amount)
		const maxAmount = bn(2).pow(bn(256)).sub(bn(1)).toString();
		await tokenContractA.methods.approve(exchangeContractAddress, maxAmount).send({ from: loadedAccount });
		console.log("Approved Exchange contract to spend tokens of userA")
	};

	// Submit order to backend
	const handleSubmit = async (e) => {
		e.preventDefault(); // Prevent the page from reloading
		console.log("Submitting order...")

		// Load wallet
		let loadedAccount = await loadAccount();
		if (!loadedAccount) {
			console.log("Cannot submit order, no wallet found");
			return;
		}

		// Decimals of A
		const decA = await getDecimals(tokenA.address);
		console.log("Decimals of A: ", decA)

		// Load nonce
		const nonce = await exchangeContract.methods.nonces(loadedAccount).call();
		console.log("Current user nonce:", nonce)

		let order = {
			user: loadedAccount,
			tokenA: tokenA.address,
			tokenB: tokenB.address,
			minAmountA: bn(Math.floor(minAmountA * 10 ** 6)).mul(bn(10).pow(bn(decA))).div(bn(10 ** 6)).toString(),
			maxAmountA: bn(Math.floor(maxAmountA * 10 ** 6)).mul(bn(10).pow(bn(decA))).div(bn(10 ** 6)).toString(),
			priceX96: bn(Math.floor(price * 10 ** 6)).mul(bn(2).pow(bn(96))).div(bn(10 ** 6)).toString(),
			maxSlippage: maxSlippage,
			nonce: nonce,
			expiration: expiration,
			code: process.env.IMPLEMENTATION_CODE,
		};
		console.log("Order: ", order)

		const messageHash = web3.utils.soliditySha3(
			{ t: 'address', v: order.user },
			{ t: 'address', v: order.tokenA.address },
			{ t: 'address', v: order.tokenB.address },
			{ t: 'uint256', v: order.minAmountA },
			{ t: 'uint256', v: order.maxAmountA },
			{ t: 'uint256', v: order.priceX96 },
			{ t: 'uint256', v: order.maxSlippage },
			{ t: 'uint256', v: order.nonce },
			{ t: 'uint256', v: order.expiration },
			{ t: 'uint256', v: order.code },
		);
		console.log("Message hash:", messageHash)
		const signature = await web3.eth.personal.sign(messageHash, loadedAccount);
		console.log("Signature: ", signature)
		order.signature = signature;

		// Send the signed order to the backend
		fetch(process.env.REACT_APP_API_URL + '/api/orders', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(order),
		})
			.then((response) => response.json())
			.then((data) => {
				console.log(data);
			})
			.catch((error) => {
				console.error('Error:', error);
			});
	};

	// Fetch external token lists, asynchronously
	useEffect(() => {
		console.log("Fetching token list...")
		const list_url = "https://tokens.coingecko.com/ethereum/all.json";
		fetch(list_url)
			.then((response) => response.json())
			.then((data) => {
				// Filter tokens so that the addresses are unique
				const tokens = Object.values(data.tokens).filter((token, index, self) =>
					index === self.findIndex((t) => (
						t.address === token.address
					))
				);
				// Sort tokens by name
				tokens.sort((a, b) => a.name.localeCompare(b.name));

				setTokenList(tokens);
			})
			.catch((error) => {
				console.error('Error:', error);
			});
		console.log("Token list fetched")
	}, []);

	// Function to fetch token balance, and the corresponding USD value if available.
	const getBalance = async (tokenAddress) => {
		if (!account) {
			return -1;
		}
		const tokenContract = new web3.eth.Contract(erc20ABI, tokenAddress);
		const balance = await tokenContract.methods.balanceOf(account).call();

		// Find if the token has a pair with WETH on Uniswap V2.
		// If so, fetch the price of the token in USD.
		const pairAddress = await factoryContract.methods.getPair(tokenAddress, WETH.address).call();
		if (bn(pairAddress.substring(2)).isZero()) {
			return balance;
		}
		
		const pairContract = new web3.eth.Contract(pairContractABI, pairAddress);
		const reserves = await pairContract.methods.getReserves().call();

	}

	return (
		<div className="container-app">
			<div className="container-top">
				<div className="navbar">
					<img className="navbar-logo" src="signswap_logo_white.png" alt="Signswap Logo" style={{ filter: 'drop-shadow(0 0 0.4rem #000000)' }} />
					<Typography variant="h4" className="navbar-title" sx={{ color: 'white', fontWeight: 'bold', filter: 'drop-shadow(0 0 0.4rem #000000)' }}>
						Signswap</Typography>
					<div className="navbar-links">
						<IconGithub link="https://github.com/emilamaj/signswap" height="32" />
						<IconEtherscan link="https://etherscan.io/address/your-contract-address" height="32" />
					</div>
				</div>
			</div>
			<div className="container-middle-panels">
				<div className="container-submit">
					<Stack direction="row"
						alignItems="flex-start"
						justifyContent="space-between">
						<Stack direction="column">
							{/* <Typography
								variant="h6"
								sx={{
									color: 'text.secondary',
								}}
							>Gasless swap</Typography> */}
						</Stack>
					</Stack>

					<form onSubmit={handleSubmit}>
						<TokenInput
							label="Token A"
							tokenList={tokenList}
							token={tokenA}
							updateToken={(t) => {
								// First, update tokenA
								setTokenA(t);

								// Then fetch balance of tokenA
								if (!account) {
									return;
								}
								getBalance(t.address).then((balance) => {
									// Update tokenA balance
									setTokenA({ ...t, balance: balance });
								});
							}}
						/>

						<IconSwitch switchAction={() => {
							const temp = tokenA;
							setTokenA(tokenB);
							setTokenB(temp);
						}} />

						<TokenInput
							label="Token B"
							tokenList={tokenList}
							token={tokenB}
							updateToken={(t) => setTokenB(t)}
						/>

						<div className="container-amounts">
							<TextField
								label="Min Amount A"
								value={minAmountA}
								onChange={(e) => setMinAmountA(e.target.value)}
								fullWidth
								helperText="Minimum amount"

							/>
							<TextField
								label="Max"
								value={maxAmountA}
								onChange={(e) => setMaxAmountA(e.target.value)}
								fullWidth

							/>
						</div>

						<Stack direction="row" gap={2}>
							<TextField
								label="Desired Price"
								value={price}
								onChange={(e) => setPrice(e.target.value)}
								fullWidth
								margin="normal"
							/>
							<TextField
								label="Slippage %"
								value={maxSlippage}
								onChange={(e) => setMaxSlippage(e.target.value)}
								fullWidth
								margin="normal"
								autoComplete="off"
							/>
						</Stack>
						<TextField
							label="Expiration Block"
							value={expiration}
							onChange={(e) => setExpiration(e.target.value)}
							fullWidth
							margin="normal"
						/>
						<div className="container-buttons">
							<Button type="submit" variant="contained" color="secondary">
								{account ? "Swap" : "Connect wallet"}
							</Button>
							{/* <IconShow isShow={isAdvanced}
								action={() => {
									setIsAdvanced(!isAdvanced);
								}} /> */}
						</div>
					</form>
				</div>
				{/* <div className="container-recent">
					<Typography variant="h5">Recent orders</Typography>
				</div> */}
			</div>
		</div>
	);
}

export default App;