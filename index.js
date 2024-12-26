const axios = require('axios');
const fs = require('fs');
const yaml = require('js-yaml');

async function createAccount() {
    try {
        // Get temp email from mail.gw API
        console.log("Getting temporary email...");
        const domainsResponse = await axios.get('https://api.mail.gw/domains');
        const domains = domainsResponse.data['hydra:member'];
        const randomDomain = domains[Math.floor(Math.random() * domains.length)].domain;
        
        // Generate random username and password
        const username = Math.random().toString(36).substring(2, 12);
        const password = Math.random().toString(36).substring(2, 12);
        const Email = `${username}@${randomDomain}`;
        console.log("Generated Email -> " + Email);
        
        // Create email account
        await axios.post('https://api.mail.gw/accounts', {
            address: Email,
            password: password
        });
        
        // Send signup request
        console.log("Sending signup request...");
        try {
            const signupResponse = await axios.post('https://privy.pump.fun/api/v1/passwordless/init', {
                email: Email
            }, {
                headers: {
                    'accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Connection': 'keep-alive', 
                    'content-type': 'application/json',
                    'Host': 'privy.pump.fun',
                    'Origin': 'https://pump.fun',
                    'privy-app-id': 'cm1p2gzot03fzqty5xzgjgthq',
                    'privy-ca-id': '659b3671-e980-4e32-9d41-2fba46281df4',
                    'privy-client': 'react-auth:1.91.0-beta-20241015190821',
                    'Referer': 'https://pump.fun/',
                    'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"Windows"',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-site',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
                }
            });
            console.log("Signup Response:", signupResponse.data);
        } catch (error) {
            throw new Error(`Signup failed: ${error.message}`);
        }

        // Wait 25 seconds before checking emails
        console.log("Waiting 25 seconds before checking emails...");
        await new Promise(resolve => setTimeout(resolve, 25000));

        // Check inbox
        let retryCount = 0;
        const maxRetries = 5;
        
        // Get auth token
        const mailAuthResponse = await axios.post('https://api.mail.gw/token', {
            address: Email,
            password: password
        });
        const mailToken = mailAuthResponse.data.token;
        
        while (true) {
            try {
                if (retryCount >= maxRetries) {
                    throw new Error("Max retries reached");
                }

                // Check inbox using mail.gw API
                const inboxResponse = await axios.get('https://api.mail.gw/messages', {
                    headers: {
                        'Authorization': `Bearer ${mailToken}`
                    }
                });
                const messages = inboxResponse.data['hydra:member'];
                console.log("Found " + messages.length + " Email(s)!");
                
                if (messages.length > 0) {
                    const latestMessage = messages[0];
                    const messageDetailsResponse = await axios.get(`https://api.mail.gw/messages/${latestMessage.id}`, {
                        headers: {
                            'Authorization': `Bearer ${mailToken}`
                        }
                    });
                    
                    const emailBody = messageDetailsResponse.data.text || messageDetailsResponse.data.html || '';
                    console.log("Email content:", emailBody);
                    
                    let verificationCode = null;
                    if (emailBody) {
                        const numbers = emailBody.match(/\d+/g);
                        if (numbers && numbers.length > 0) {
                            verificationCode = numbers[0];
                            console.log("Found verification code:", verificationCode);
                        }
                    }

                    if (verificationCode) {
                        // Send authentication request
                        console.log("Sending authentication request...");
                        const authResponse = await axios.post('https://privy.pump.fun/api/v1/passwordless/authenticate', {
                            email: Email,
                            code: verificationCode,
                            mode: "login-or-sign-up"
                        }, {
                            headers: {
                                'accept': 'application/json',
                                'Accept-Encoding': 'gzip, deflate, br, zstd',
                                'Accept-Language': 'en-US,en;q=0.9',
                                'content-type': 'application/json',
                                'privy-app-id': 'cm1p2gzot03fzqty5xzgjgthq',
                                'privy-ca-id': '659b3671-e980-4e32-9d41-2fba46281df4',
                                'privy-client': 'react-auth:1.91.0-beta-20241015190821',
                                'Origin': 'https://pump.fun',
                                'Referer': 'https://pump.fun/',
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
                            }
                        });
                        
                        const token = authResponse.data.token;
                        
                        // Update auth.yaml with new token
                        try {
                            const authFile = fs.readFileSync('auth.yaml', 'utf8');
                            const authData = yaml.load(authFile);
                            
                            if (!authData.auth_tokens) {
                                authData.auth_tokens = [];
                            }
                            
                            authData.auth_tokens.push(token);
                            
                            fs.writeFileSync('auth.yaml', yaml.dump(authData));
                            console.log('Successfully updated auth.yaml with new token');
                        } catch (error) {
                            console.error('Error updating auth.yaml:', error);
                        }
                        
                        return { token };
                    }
                }
                
                await new Promise(resolve => setTimeout(resolve, 5000));
                retryCount++;
                
            } catch (error) {
                console.error("\nAn error occurred checking emails:", error.message);
                await new Promise(resolve => setTimeout(resolve, 5000));
                retryCount++;
            }
        }
    } catch (error) {
        throw new Error(`Account creation failed: ${error.message}`);
    }
}

// Start creating accounts immediately
(async () => {
    console.log("Starting account creation process...");
    while(true) {
        try {
            await createAccount();
            console.log("Successfully created account and saved token");
            // Wait 5 seconds before creating next account
            await new Promise(resolve => setTimeout(resolve, 5000));
        } catch (error) {
            console.error("Error creating account:", error.message);
            // Wait 10 seconds before retrying on error
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
})();



