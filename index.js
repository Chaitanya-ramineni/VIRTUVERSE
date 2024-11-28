const algosdk = require('algosdk');

// Define the API connection to Algorand's network
const algodToken = '';
const algodServer = 'https://testnet-api.algonode.cloud';
const algodPort = '';
const algodClient = new algosdk.Algodv2(algodToken, algodServer, algodPort);

// Define account credentials
const creatorMnemonic = "YOUR_25_WORD_MNEMONIC_FOR_CREATOR";
const platformMnemonic = "YOUR_25_WORD_MNEMONIC_FOR_PLATFORM";

// Convert mnemonics to private keys and addresses
const creatorAccount = algosdk.mnemonicToSecretKey(creatorMnemonic);
const platformAccount = algosdk.mnemonicToSecretKey(platformMnemonic);

const creatorAddress = creatorAccount.addr;
const platformAddress = platformAccount.addr;

// Function to perform the revenue distribution
const distributeRevenue = async (totalAmount) => {
    try {
        // Fetch network parameters
        const params = await algodClient.getTransactionParams().do();

        // Calculate amounts for creator and platform
        const creatorAmount = Math.floor(totalAmount * 0.7); // 70%
        const platformAmount = totalAmount - creatorAmount;  // Remaining 30%

        // Transaction 1: Payment to Creator
        const creatorTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: platformAddress,
            to: creatorAddress,
            amount: creatorAmount,
            suggestedParams: params,
        });

        // Transaction 2: Payment to Platform
        const platformTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
            from: platformAddress,
            to: platformAddress,
            amount: platformAmount,
            suggestedParams: params,
        });

        // Group the transactions
        const txnGroup = [creatorTxn, platformTxn];
        algosdk.assignGroupID(txnGroup);

        // Sign the transactions
        const signedCreatorTxn = creatorTxn.signTxn(platformAccount.sk);
        const signedPlatformTxn = platformTxn.signTxn(platformAccount.sk);

        // Combine the signed transactions
        const signedGroup = [signedCreatorTxn, signedPlatformTxn];

        // Send the transactions
        const txId = await algodClient.sendRawTransaction(signedGroup).do();
        console.log(`Transaction ID: ${txId}`);

        // Wait for confirmation
        const confirmedTxn = await algosdk.waitForConfirmation(algodClient, txId, 4);
        console.log("Transaction confirmed in round:", confirmedTxn["confirmed-round"]);
    } catch (error) {
        console.error("Error distributing revenue:", error);
    }
};

// Call the function with a total amount in microAlgos (1 Algo = 1,000,000 microAlgos)
const totalAmount = 1000000; // 1 Algo
distributeRevenue(totalAmount);

