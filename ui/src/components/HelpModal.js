import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material';

function HelpModal({ open, handleClose }) {
    // Text style
    const ts = { color: 'white', filter: 'drop-shadow(0 0 0.05rem #000000)', paddingBottom: '1rem' }
    return (
        <Dialog
            open={open}
            onClose={handleClose}
            PaperProps={{ style: { background: 'linear-gradient(to right, #ff8800, #e52d27)' } }}

        >
            <DialogTitle id="alert-dialog-title"
                sx={{ color: 'white', filter: 'drop-shadow(0 0 0.2rem #000000)' }}
            >Signswap Help</DialogTitle>
            <DialogContent>
                <DialogContentText
                    sx={ts}
                >
                    Signswap allows you to swap your tokens without having to pay any gas fees, by matching the cryptographically signed orders of users with opposite needs.
                </DialogContentText>
                <DialogContentText
                    sx={ts}
                >
                    Your crypto wallet will simply sign the transaction order (signing is performed off-chain and so is free) and send it to the Signswap relayer.
                </DialogContentText>
                <DialogContentText
                    sx={ts}
                >
                    In order to benefit from the gas-free swaps, Signswap's exchange contract needs to be approved to spend the input token of the swap.
                    This step costs gas but must be performed only once per token.
                </DialogContentText>
                <DialogContentText
                    sx={ts}
                >
                    In the advanced settings, you may choose to accept a price slippage tolerance. This will make your order more likely to go through before the expiration delay, but may result in a worse price. The default value is 1%.
                </DialogContentText>
                <DialogContentText
                    sx={ts}
                >
                    If you want to accelerate your swap, you may choose to swap less of the input token. You can also choose a longer expiration delay, which will make your order more likely to go through, but may result in a worse price. The default value is 1 hour (300 blocks).
                </DialogContentText>


            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose} color="primary" autoFocus>
                    Close
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default HelpModal;
