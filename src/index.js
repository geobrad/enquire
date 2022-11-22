const https = require('https');
const querystring = require('querystring');
const aws = require('aws-sdk');

const ses = new aws.SES({ region: process.env.AWS_SES_REGION });

function isString(x) {
    return typeof(x) == 'string';
}

function validateRecaptchaResponse(recaptchaResponse) {
    // return Promise.resolve(true);
    return new Promise((resolve, reject) => {
        const options = {
            host: 'www.google.com',
            path: '/recaptcha/api/siteverify',
            method: 'POST',
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
        };
        const reqStream = https.request(options, (resStream) => {
            let resRaw = '';
            resStream.on('data', chunk => {
                resRaw += chunk;
            });
            resStream.on('end', () => {
                let res;
                try {
                    res = JSON.parse(resRaw);
                } catch (e) {
                    console.error(e);
                    reject(500);
                    return;
                }
                if (res.success) {
                    resolve(true);
                } else {
                    console.log("ReCaptcha verification failed");
                    reject(400);
                }
            });
        });
        reqStream.on('error', (err) => {
            console.log(err.message);
            reject(500);
        });
        reqStream.write(querystring.stringify({
            secret: process.env.RECAPTCHA_SECRET_KEY,
            response: recaptchaResponse,
        }));
        reqStream.end();
    });
}

function validateFormData(data) {
    if (!isString(data['name'])) return 'name argument is not a string.';
    if (!isString(data['email-or-phone'])) return 'email-or-phone argument is not a string.';
    if (!isString(data['message'])) return 'message argument is not a string.';
    if (!isString(data['g-recaptcha-response'])) return 'g-recaptcha-response argument is not a string.';
    return null;
}

function sendMail(subject, text) {
    console.log('Sending email . . .');
    const params = {
        Source: proFROM_EMAIL,
        Destination: {
            ToAddresses: [process.env.TO_EMAIL],
        },
        Message: {
            Subject: { Data: subject },
            Body: {
                Text: { Data: text },
            },
        },
    };
    return ses.sendEmail(params).promise()
        .catch((err) => {
            console.error(err);
            return Promise.reject(500);
        });
}

exports.handler = async function (evt) {
    const formData = JSON.parse(evt.body);
    const validationError = validateFormData(formData);
    if (validationError) {
        console.log(validationError);
        return { statusCode: 400 };
    }
    
    const nowISO = (new Date()).toISOString();
    const subject = `Enquiry from gbrad.com at ${nowISO}`;
    const message = `Name: ${formData['name']}\n`
        + `Email/Phone: ${formData['email-or-phone']}\n`
        + "--------------------------------------------------\n"
        + formData['message'];

    return validateRecaptchaResponse(formData['g-recaptcha-response'])
        .then(() => sendMail(subject, message))
        .then(() => ({ statusCode: 200 }))
        .catch((errCode) => ({ statusCode: errCode }));
};

