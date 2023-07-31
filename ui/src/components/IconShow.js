import React from 'react';
import { Button } from '@mui/material';

function IconShow({ isShow, action, sx }) {
    return (isShow ?
        <Button variant="contained"
            color="secondary"
            onClick={action}
            title="Hide"
            style={{ padding: 0, color: "white", height: "36px", minWidth: "16px", width: "32px", ...sx }}
            >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 15l6-6 6 6" />
            </svg>
        </Button>
        :
        <Button variant="contained"
            color="secondary"
            onClick={action}
            title="Show"
            style={{ padding: 0, color: "white", height: "36px", minWidth: "16px", width: "32px", ...sx }}
            >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
            </svg>
        </Button>
    );
}

export default IconShow;