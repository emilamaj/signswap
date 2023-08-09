import React, { useState, useEffect } from 'react';
import Web3 from 'web3';
import { Button, TextField, Container, Typography, Stack, Link, InputAdornment } from '@mui/material';
import './App.css';
import IconSwitch from './components/IconSwitch';
import IconShow from './components/IconShow';
import TokenInput from './components/TokenInput';
import IconGithub from './components/IconGithub';
import IconEtherscan from './components/IconEtherscan';
import HelpModal from './components/HelpModal';
import IconHelp from './components/IconHelp';

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
	const [helpOpen, setHelpOpen] = useState(false);
	const [isAdvanced, setIsAdvanced] = useState(false);
	const [isPriceInverted, setIsPriceInverted] = useState(false); // Use either TokenB/TokenA (normal) or TokenA/TokenB (inverted)
	const [buttonState, setButtonState] = useState("Connect Wallet"); // Either "Swap", "Approve", or "Connect Wallet"
	// Form inputs
	const [account, setAccount] = useState('');
	const [tokenA, setTokenA] = useState(WETH);
	const [tokenB, setTokenB] = useState(DAI);
	const [minAmountA, setMinAmountA] = useState("0"); // Ignore token decimals in App.js, convert to correct integer in handleSubmit()
	const [maxAmountA, setMaxAmountA] = useState("0");
	const [receiveB, setReceiveB] = useState("0"); // [maxAmountA] * [price]
	const [price, setPrice] = useState('1.0');
	const [maxSlippage, setMaxSlippage] = useState(1.0);
	const [expiration, setExpiration] = useState(300);
	// App data
	const [errorMsg, setErrorMsg] = useState("");
	const [allowance, setAllowance] = useState(0); // Amount of tokenA that the Exchange Contract is allowed to spend
	const [ethPrice, setEthPrice] = useState(null); // USD price of ETH
	const [decimals, setDecimals] = useState({});
	const [tokenList, setTokenList] = useState([]);

	// Compute submit button state text
	useEffect(() => {
		const computeButtonText = async () => {
			if (!account) {
				setButtonState("Connect Wallet");
				return;
			}

			const decA = await getDecimals(tokenA.address);
			if (!allowance || bn(allowance).lt(bn(Math.floor(maxAmountA * 10 ** 18)).mul(bn(10).pow(bn(decA))).div(bn(10 ** 18)))) {
				setButtonState("Approve");
				return;
			}

			setButtonState("Swap");
		}
		computeButtonText();
	}, [account, allowance, maxAmountA]);

	// Calculate receiveB
	useEffect(() => {
		if (isPriceInverted) {
			setReceiveB((parseFloat(maxAmountA) / parseFloat(price)).toFixed(3));
		} else {
			setReceiveB((parseFloat(maxAmountA) * parseFloat(price)).toFixed(3));
		}
	}, [maxAmountA, price, isPriceInverted]);

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

	// Fetch ETH price once on load
	useEffect(() => {
		if (ethPrice) {
			return;
		}
		const fetchEthPrice = async () => {
			const apiUrl = "https://api.etherscan.io/api?module=stats&action=ethprice";
			console.log(`Fetching price. Current timestamp (s.ms): ${Date.now() / 1000}`);
			await fetch(apiUrl)
				.then((response) => response.json())
				.then((data) => {
					const price = parseFloat(data.result.ethusd);
					console.log("ETH price: ", price);
					if (!!price) {
						setEthPrice(price);
					}
				})
				.catch((error) => {
					console.error('Error:', error);
				});
		}
		fetchEthPrice();
	}, []);

	// Check on page load if wallet has already been connected
	useEffect(() => {
		const checkWallet = async () => {
			if (window.ethereum) {
				const accs = await window.ethereum.request({ method: 'eth_accounts' });
				if (accs.length) {
					console.log("Wallet already connected. No need to connect again.");
				} else {
					console.log("Wallet is not connected");
				}

				if (accs.length > 0) {
					setAccount(accs[0]);
				}
			} else {
				console.log("No wallet found")
			}
		}
		checkWallet();
	}, []);

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

	// Automatically fetch allowance on tokenA/account change
	useEffect(() => {
		const fetchAllowance = async () => {
			if (!account) {
				return;
			}
			console.log("ERC20 ABI: ", erc20ABI)
			const tokenContractA = new web3.eth.Contract(erc20ABI, tokenA.address);
			const allowance = await tokenContractA.methods.allowance(account, exchangeContractAddress).call();
			setAllowance(Math.floor(allowance));
		}
		fetchAllowance();
	}, [tokenA.address, account]);

	// Submit order to backend
	const handleSubmit = async (e) => {
		e.preventDefault(); // Prevent the page from reloading

		if (buttonState === "Connect Wallet") {
			await loadAccount();
			return;
		} else if (buttonState === "Approve") {
			await handleApprove(e);
			return;
		} else { } // buttonState === "Swap"

		// Load wallet
		let loadedAccount = await loadAccount();
		console.log("Using account: ", loadedAccount)

		// Decimals of A
		const decA = await getDecimals(tokenA.address);
		console.log("Decimals of A: ", decA)

		// Check approval (shouldn' be necessary)
		if (!allowance || bn(allowance).lt(bn(Math.floor(maxAmountA * 10 ** 18)).mul(bn(10).pow(bn(decA))).div(bn(10 ** 18)))) {
			setErrorMsg("Insufficient allowance");
			console.error("Redundant check failed. Allowance: ", allowance, " Max amount A: ", maxAmountA);
			return;
		}

		console.log("Submitting order...")
		setErrorMsg("");

		// Load nonce
		const nonce = await exchangeContract.methods.nonces(loadedAccount).call();
		console.log("Current user nonce:", nonce)

		// Load expiration
		const blockNumber = await web3.eth.getBlockNumber();
		const targetBlock = blockNumber + expiration;

		let order;
		if (isAdvanced) {
			order = {
				user: loadedAccount,
				tokenA: tokenA.address,
				tokenB: tokenB.address,
				minAmountA: bn(Math.floor(minAmountA * 10 ** 18)).mul(bn(10).pow(bn(decA))).div(bn(10 ** 18)).toString(),
				maxAmountA: bn(Math.floor(maxAmountA * 10 ** 18)).mul(bn(10).pow(bn(decA))).div(bn(10 ** 18)).toString(),
				priceX96: bn(Math.floor(price * 2 ** 96)).toString(),
				maxSlippage: Math.floor(maxSlippage * 100),
				nonce: nonce,
				expiration: targetBlock,
				code: process.env.IMPLEMENTATION_CODE,
			};

		} else {
			order = {
				user: loadedAccount,
				tokenA: tokenA.address,
				tokenB: tokenB.address,
				minAmountA: bn(Math.floor(minAmountA * 10 ** 18)).mul(bn(10).pow(bn(decA))).div(bn(10 ** 18)).toString(),
				maxAmountA: bn(Math.floor(maxAmountA * 10 ** 18)).mul(bn(10).pow(bn(decA))).div(bn(10 ** 18)).toString(),
				priceX96: bn(Math.floor(price * 2 ** 96)).toString(),
				maxSlippage: Math.floor(maxSlippage * 100),
				nonce: nonce,
				expiration: targetBlock,
				code: process.env.IMPLEMENTATION_CODE,
			};
		}
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
			return { token: null, usd: null }
		}
		const tokenContract = new web3.eth.Contract(erc20ABI, tokenAddress);
		const balance = await tokenContract.methods.balanceOf(account).call();

		// Check if the token is WETH
		if (tokenAddress.toLowerCase() !== WETH.address.toLowerCase()) {
			// Find the decimals of the token, and find the balance in facing decimals.
			const tokenDecimals = await getDecimals(tokenAddress);
			const bal = bn(balance).div(bn(10).pow(bn(tokenDecimals)))

			// Find if the token has a pair with WETH on Uniswap V2.
			const pairAddress = await factoryContract.methods.getPair(tokenAddress, WETH.address).call();
			if (bn(pairAddress.substring(2)).isZero()) {
				return { token: bal.toString(), usd: null }
			}

			// The token has a pair with WETH on Uniswap V2. Fetch the reserves to find the price in ETH.
			const pairContract = new web3.eth.Contract(pairContractABI, pairAddress);
			const reserves = await pairContract.methods.getReserves().call();

			// Assign the correct reserves to the token and WETH.
			const reservesToken = tokenAddress.toLowerCase() < WETH.address.toLowerCase() ? reserves[0] : reserves[1];
			const reservesWETH = tokenAddress.toLowerCase() < WETH.address.toLowerCase() ? reserves[1] : reserves[0];

			// Find the price of the token in ETH, then in USD.
			const tokenPriceInETH = bn(reservesWETH).mul(bn(10).pow(bn(tokenDecimals))).div(bn(reservesToken).mul(bn(10).pow(bn(18))));
			const tokenPriceInUSD = tokenPriceInETH.toNumber() * ethPrice;
			console.log("Token price in ETH: ", tokenPriceInETH.toString())
			console.log("Token price in USD: ", tokenPriceInUSD)

			// Return the balance and the USD value.
			let retBal = {
				token: bal.toString(),
				usd: tokenPriceInUSD * bal.toNumber()
			}
			console.log("Balance of ", tokenAddress, ": ", retBal)
			return retBal;

		} else {
			// The token is WETH. Return the balance and the USD value.
			let retBal = {
				token: bn(balance).div(bn(10).pow(bn(18))).toString(),
				usd: bn(balance).div(bn(10).pow(bn(18))).toNumber() * ethPrice
			}
			console.log("Balance of ", tokenAddress, ": ", retBal)
			return retBal;
		}
	}

	// Automatically fetch balance of tokenA and tokenB, on token change or account change.
	useEffect(() => {
		const fetchBalances = async () => {
			const balA = await getBalance(tokenA.address);
			const balB = await getBalance(tokenB.address);
			setTokenA({ ...tokenA, balance: balA });
			setTokenB({ ...tokenB, balance: balB });
		}
		fetchBalances();
	}, [tokenA.address, tokenB.address, account]);

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
					{/* <Stack direction="row"
						alignItems="flex-start"
						justifyContent="space-between">
						<Stack direction="column">
							<Typography
								variant="h6"
								sx={{
									color: 'text.secondary',
								}}
							>Gasless swaps</Typography>
						</Stack>
					</Stack> */}

					<form onSubmit={handleSubmit}>
						<TokenInput
							label="Input Token"
							tokenList={tokenList}
							token={tokenA}
							updateToken={(t) => setTokenA(t)}
						/>

						<IconSwitch switchAction={() => {
							const temp = tokenA;
							setTokenA(tokenB);
							setTokenB(temp);
						}} />

						<TokenInput
							label="Receive Token"
							tokenList={tokenList}
							token={tokenB}
							updateToken={(t) => setTokenB(t)}
						/>

						<Stack direction="row" gap={2}>
							{isAdvanced ? <>
								<TextField
									label="Min Input Amount"
									value={minAmountA}
									onChange={(e) => setMinAmountA(e.target.value)}
									onBlur={(e) => e.target.value === "" && setMinAmountA(0)}
									fullWidth
									InputProps={{
										endAdornment: <InputAdornment position="end">{tokenA.symbol}</InputAdornment>,
									}}
									error={minAmountA < 0 || minAmountA > maxAmountA}
									helperText={minAmountA < 0 ? "Must be positive" : minAmountA > maxAmountA ? "Must be < Max" : ""}
								/>
								<TextField
									label="Max Input Amount"
									value={maxAmountA}
									onChange={(e) => setMaxAmountA(e.target.value)}
									fullWidth
									InputProps={{
										endAdornment: <InputAdornment position="end">{tokenA.symbol}</InputAdornment>,
									}}

								/>
							</> : <>
								<TextField
									label="Input Amount"
									value={maxAmountA}
									fullWidth
									InputProps={{
										endAdornment: <InputAdornment position="end">{tokenA.symbol}</InputAdornment>,
									}}
									autoComplete="off"
									onChange={(e) => setMaxAmountA(e.target.value)}
									onBlur={(e) => e.target.value === "" && setMaxAmountA(0)}
									type="number"
									error={maxAmountA < 0}
									helperText={maxAmountA < 0 ? "Must be positive" : ""}
								/>
								<TextField
									label="Receive Amount"
									value={receiveB}
									disabled
									fullWidth
									InputProps={{
										endAdornment: <InputAdornment position="end">{tokenB.symbol}</InputAdornment>,
									}}
								/>
							</>
							}
						</Stack>
						{isAdvanced &&
							<TextField
								label="Receive Amount (Max)"
								value={receiveB}
								disabled
								fullWidth
								margin='normal'
								InputProps={{
									endAdornment: <InputAdornment position="end">{tokenB.symbol}</InputAdornment>,
								}}
							/>
						}

						<Stack direction="row" gap={2}>
							<TextField
								label="Desired Price"
								value={price}
								onChange={(e) => setPrice(e.target.value)}
								onBlur={(e) => e.target.value === "" && setPrice(0)}
								fullWidth
								margin="normal"
								error={price <= 0}
								helperText={price <= 0 ? "Must be > 0" : ""}
							/>
							{isAdvanced && <TextField
								label="Slippage"
								value={maxSlippage}
								margin="normal"
								autoComplete="off"
								onChange={(e) => setMaxSlippage(e.target.value)}
								onBlur={(e) => setMaxSlippage(parseFloat(e.target.value).toFixed(1))}
								InputProps={{
									endAdornment: <InputAdornment position="end">%</InputAdornment>,
								}}
								type="number"
								inputProps={{
									min: 0,
									max: 100,
									step: 0.1,
								}}

							/>}
						</Stack>
						{
							isAdvanced && <TextField
								label="Expires in"
								value={expiration}
								margin="normal"
								onChange={(e) => setExpiration(e.target.value)}
								onBlur={(e) => {
									if (e.target.value === "") {
										setExpiration(300);
									} else if (parseInt(e.target.value) < 0) {
										setExpiration(0);
									} else if (parseInt(e.target.value) > 26280000) {
										setExpiration(26280000);
									} else {
										setExpiration(parseInt(e.target.value))
									}
								}}
								InputProps={{
									endAdornment: <InputAdornment position="end">blocks</InputAdornment>,
								}}
								type="number"
								inputProps={{
									style: { textAlign: 'right' }
								}}

							/>
						}

						{isAdvanced && <>
							<Typography variant="body2" sx={{ color: 'text.secondary', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
								Wallet: {account ? account : "Not connected"}
							</Typography>
							<Typography variant="body2" sx={{ color: 'text.secondary', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
								Allowance: {allowance} <Link href="#" onClick={handleApprove} sx={{ color: 'white', textDecoration: 'none' }}
								>&nbsp;&nbsp;Approve More</Link>
							</Typography>
						</>
						}
						{errorMsg && <Typography variant="body2" sx={{ color: '#d32f2f' }}>{errorMsg}</Typography>
						}
						<div className="container-buttons">
							<IconHelp
								variant="contained"
								color="secondary"
								action={() => setHelpOpen(true)}
							/>
							<Button type="submit" variant="contained" color="primary">
								{buttonState}
							</Button>
							<IconShow isShow={isAdvanced}
								action={() => { setIsAdvanced(!isAdvanced) }} />
							<HelpModal open={helpOpen} handleClose={() => setHelpOpen(false)} />

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