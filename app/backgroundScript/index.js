import PortHost from 'lib/communication/PortHost';
import PopupClient from 'lib/communication/popup/PopupClient';
import LinkedResponse from 'lib/messages/LinkedResponse';
import Wallet from './wallet';
import Logger from 'lib/logger';

const logger = new Logger('backgroundScript');
const portHost = new PortHost();
const popup = new PopupClient(portHost);
const linkedResponse = new LinkedResponse(portHost);
const wallet = new Wallet();
const pendingConfirmations = {};

logger.info('Script loaded');

let currentConfirmationId = 0;

function addConfirmation(confirmation, resolve, reject){
    logger.info('Adding confirmation: ');
    logger.info(confirmation);

    currentConfirmationId++;
    confirmation.id = currentConfirmationId;
    pendingConfirmations[confirmation.id] = {
        confirmation,
        resolve,
        reject
    };

    window.open('app/popup/build/index.html', 'extension_popup', 'width=420,height=595,status=no,scrollbars=yes,resizable=no');
}
function getConfirmations(){
    let out = [];
    let keys = Object.keys(pendingConfirmations);
    for(let i in keys){
        out.push(pendingConfirmations[keys[i]].confirmation);
    }
    return out;
}

//open popup


popup.on('denyConfirmation', ({data, resolve, reject})=>{
    if(!pendingConfirmations[data.id])
        alert("tried denying confirmation, but confirmation went missing.");
    pendingConfirmations[data.id].resolve("denied");
    resolve();
});

popup.on('acceptConfirmation', ({data, resolve, reject})=>{
    if(!pendingConfirmations[data.id])
        alert("tried accepting confirmation, but confirmation went missing.");

    let confirmation = pendingConfirmations[data.id];
    logger.info('accepting confirmation');
    logger.info(confirmation);
    confirmation.resolve("accepted");
    resolve();
});

popup.on('getConfirmations', ({data, resolve, reject})=>{
    logger.info('getConfirmations called');
    resolve(getConfirmations());
});

popup.on('requestUnfreeze', ({ data, resolve, reject }) => {
    const { account } = data;

    logger.info(`Requested unfreeze for account ${account}`);
    resolve(50); // we unfroze 50 tokens    

    popup.requestVote('your mother').then(({ amount, account }) => {
        logger.info(`Vote confirmation for your mother: ${amount} tron power from ${account}`);
    }).catch(err => {
        logger.warn('Vote confirmation rejected:', err);
    });
});

popup.on('setPassword', ({data, resolve, reject})=>{
    logger.info('before, wallet:');
    logger.info(wallet);
    if(wallet.isInitialized()){
        alert("Wallet already initialized. Need to explicitly clear before doing this.");
    }else{
        wallet.initWallet(data.password);
    }
});

popup.on('unlockWallet', ({data, resolve, reject})=>{
    logger.info('unlockWallet');
    logger.info(data);
    resolve(wallet.unlockWallet(data.password));
});

popup.on('getWalletStatus', ({data, resolve, reject})=>{
    resolve(wallet.getStatus());
});

const handleWebCall = ({ request: { method, args = {} }, resolve, reject }) => {
    switch(method) {
        case 'sendTrx':
            addConfirmation({
                type : "send",
                from : args.from,
                amount : args.amount
            }, resolve, reject);
        break;
        case 'signTransaction':
            // Expects { signedTransaction: string, broadcasted: bool, transactionID: string }

            const { 
                transaction,
                broadcast
            } = args;
            
            resolve({
                signedTransaction: btoa(String(transaction)),
                broadcasted: false,
                transaction: false
            });
        break;
        case 'getTransaction':
            // Expects { transaction: obj }
            reject('Method pending implementation');
        break;
        case 'getUserAccount':
            // Expects { address: string, balance: integer }
            reject('Method pending implementation');
        break;
        case 'simulateSmartContract':
            // I'm not sure what the input / output will be here
            reject('Method pending implementation');
        break;
        default:
            reject('Unknown method called (' + method + ')');
    }
}

linkedResponse.on('request', ({ request, resolve, reject }) => {
    if(request.method)
        return handleWebCall({ request, resolve, reject });

    // other functionality here or w/e
});
