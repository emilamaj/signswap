################
# TokenDump.py #
################
# Glue script to dump all Ethereum tokens from CoinMarketCap to a JSON file
# Use with PermitFinder.py to find tokens with permit() function (Allows a fully gasless transaction)

import json
import time
from requests import Session

# Register for a free API key at https://coinmarketcap.com/api/
COINMARKETCAP_API_KEY = "<YOUR_API_KEY_HERE>"
MIN_VOLUME_USD = 1000  # Min. daily USD volume of selected coins/tokens
LIMIT = 5000  # Max. number of items to fetch per query (should be around 5000 max)

print("Running Token Dump script...")

# Define base URL for API calls
url = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest'

# Define parameters for the API request
parameters = {
    'start': 1,
    'limit': LIMIT,
    'sort': "market_cap",
    'volume_24h_min': MIN_VOLUME_USD,
    'sort_dir': 'desc',
    'convert': 'USD'
}

# Define headers for the API request
headers = {
    'Accepts': 'application/json',
    'X-CMC_PRO_API_KEY': COINMARKETCAP_API_KEY,
}

# Initialize session and update headers
session = Session()
session.headers.update(headers)

# Initialize data structures
fullData = []
canExit = False

# Main loop to fetch data until all data has been received
while not canExit:
    try:
        # Send GET request to API
        response = session.get(url, params=parameters)
        # Parse response to JSON
        responseData = json.loads(response.text)
        # Append received data to fullData
        fullData += responseData['data']
        # Get total count from status field
        totalCount = responseData["status"]['total_count']
        print(f"Length just received: {len(responseData['data'])}")
        
        # Check if all data has been received
        if len(fullData) < totalCount:
            parameters['start'] += LIMIT
            time.sleep(5)
        else:
            canExit = True

    except Exception as e:
        print(repr(e))

print(f'Status: {responseData["status"]}')
print(f"Length fetched: {len(fullData)}")

# Filter out data related to Ethereum tokens, discard invalid data
coinList = []
for token in fullData:
    platform = token.get("platform")
    if platform and platform.get("name") == "Ethereum":
        address = platform.get("token_address", "")
        if not address:
            print(f"Invalid token address, empty, token={token['name']}, address={address}")
        elif " " in address:
            print(f"Invalid token address, contains spaces, token={token['name']}, address={address}")
        elif not address.startswith("0x"):
            print(f"Invalid token address, no hexString, token={token['name']}, address={address}")
        else:
            coinList.append(token)

print(f"Found {len(coinList)} valid Ethereum tokens over {len(fullData)} ")

# Extract desired fields: name, symbol, token_address, market_cap
tokenList = [{
    "address": token["platform"]["token_address"],
    "name": token["name"],
    "symbol": token["symbol"],
    "market_cap": token["quote"]["USD"]["market_cap"]
} for token in coinList]

print(f"Fetched {len(tokenList)} symbols")

# Write token data to a JSON file
with open('TokenList.json', 'w') as fp:
    json.dump(tokenList, fp, indent=4)
