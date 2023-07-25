import React, { useState, useEffect } from 'react';
import Web3 from 'web3';
import { Button, TextField, Container, Typography, Stack } from '@mui/material';
import './App.css';
import IconSwitch from './components/IconSwitch';
import IconShow from './components/IconShow';
import TokenInput from './components/TokenInput';

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


const web3 = new Web3(Web3.givenProvider);
const bn = (n) => Web3.utils.toBN(n);

const contractAddress = process.env.REACT_APP_CONTRACT_ADDRESS; // Add your contract address here
let contractABI; // Read the abi from /public/abi/OrderBookExchange.json
let erc20ABI; // Read the abi from /public/abi/ERC20.json
let contract;
// Defer contract creation until ABI is loaded
fetch('/abi/OrderBookExchange.json').then((response) => response.json()).then((data) => {
	contractABI = data.abi;
	contract = new web3.eth.Contract(contractABI, contractAddress);
});
fetch('/abi/ERC20.json').then((response) => response.json()).then((data) => {
	erc20ABI = data.abi;
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

	// Approve contract to spend tokens of userA and userB
	const handleApprove = async (e) => {
		e.preventDefault(); // Prevent the page from reloading
		console.log("Approving tokens...")

		// Load wallet
		let loadedAccount = account;
		if (window.ethereum) {
			const accs = await window.ethereum.enable();
			console.log("Wallet returned accounts: ", accs)
			loadedAccount = accs[0];
			setAccount(loadedAccount);
			console.log("Loaded account: ", loadedAccount)
		}

		// Load token contract
		const tokenContractA = new web3.eth.Contract(erc20ABI, tokenA.address);

		// Approve contract to spend tokens (max amount)
		const maxAmount = bn(2).pow(bn(256)).sub(bn(1)).toString();
		await tokenContractA.methods.approve(contractAddress, maxAmount).send({ from: loadedAccount });
		console.log("Approved Exchange contract to spend tokens of userA")
	};

	// Submit order to backend
	const handleSubmit = async (e) => {
		e.preventDefault(); // Prevent the page from reloading
		console.log("Submitting order...")

		// Load wallet
		let loadedAccount = account;
		if (window.ethereum) {
			const accs = await window.ethereum.enable();
			console.log("Wallet returned accounts: ", accs)
			loadedAccount = accs[0];
			setAccount(loadedAccount);
			console.log("Loaded account: ", loadedAccount)
		}

		// Decimals of A
		const decA = await getDecimals(tokenA.address);
		console.log("Decimals of A: ", decA)

		// Load nonce
		const nonce = await contract.methods.nonces(loadedAccount).call();
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

	// Function to fetch token balance
	const getBalance = async (tokenAddress) => {
		const tokenContract = new web3.eth.Contract(erc20ABI, tokenAddress);
		const balance = await tokenContract.methods.balanceOf(account).call();
		return balance;
	}

	return (
		<div className="container-app">
			<div className="container-top">
			</div>
			<div className="container-middle-panels">
				<div className="container-submit">
					<Stack direction="row"
						alignItems="flex-start"
						justifyContent="space-between">
						<Stack direction="column">
							<Typography
								variant="h5"
								sx={{
									color: 'text.primary',
									fontWeight: 'bold'
								}}
							>Signswap</Typography>
							<Typography
								variant="h6"
								sx={{
									color: 'text.secondary',
								}}
							>Gasless swaps</Typography>
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
								margin="normal"
							/>
							<TextField
								label="Max"
								value={maxAmountA}
								onChange={(e) => setMaxAmountA(e.target.value)}
								fullWidth
								margin="normal"
							/>
						</div>
						<TextField
							label="Desired Price"
							value={price}
							onChange={(e) => setPrice(e.target.value)}
							fullWidth
							margin="normal"
						/>
						<TextField
							label="Max Slippage (1bp = 0.01%)"
							value={maxSlippage}
							onChange={(e) => setMaxSlippage(e.target.value)}
							fullWidth
							margin="normal"
							autoComplete="off"
						/>
						<TextField
							label="Expiration Block"
							value={expiration}
							onChange={(e) => setExpiration(e.target.value)}
							fullWidth
							margin="normal"
						/>
						<div className="container-buttons">
							<Button variant="contained" color="secondary" onClick={handleApprove}>
								Approve
							</Button>
							<Button type="submit" variant="contained" color="primary">
								Submit
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