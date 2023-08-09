import React from 'react';
import { Button } from '@mui/material';

function IconHelp({ action, sx }) {
    return (<Button variant="contained"
        color="primary"
        onClick={action}
        title="Help"
        style={{ padding: 0, color: "white", height: "36px", minWidth: "16px", width: "32px", ...sx }}
    >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 50" fill="white">
            <text x="15" y="37" fontSize="35" fontFamily="Verdana">?</text>
        </svg>
    </Button>
    );
}

export default IconHelp;