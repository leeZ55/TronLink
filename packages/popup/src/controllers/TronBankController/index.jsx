/*
 * @Author: lxm
 * @Date: 2019-03-19 15:18:05
 * @Last Modified by: lxm
 * @Last Modified time: 2019-03-28 17:38:13
 * TronBankPage
 */
import React from 'react';
import { FormattedMessage, injectIntl } from 'react-intl';
import { PopupAPI } from '@tronlink/lib/api';
import TronWeb from 'tronweb';
import NodeService from '@tronlink/backgroundScript/services/NodeService';
import { BANK_STATE, APP_STATE } from '@tronlink/lib/constants';
import { NavBar, Button, Modal, Toast } from 'antd-mobile';
import Utils from '@tronlink/lib/utils';
import './TronBankController.scss';
class BankController extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            popoverVisible: false,
            rentModalVisible: false,
            rentConfirmVisible: false,
            recipient: {
                value: '',
                valid: true,
                error: false
            },
            rentNum: {
                value: '',
                predictVal: '',
                predictStatus: false,
                valid: false,
                error: false
            },
            rentDay: {
                value: '',
                valid: false,
                error: false,
                maxError: false
            },
            rentNumMin: 10,
            rentNumMax: 1000,
            rentDayMin: 3,
            rentDayMax: 30,
            rentUnit: {
                num: 10,
                day: 1,
                cost: 0.5
            },
            defaultUnit: {
                num: 10,
                day: 1,
                cost: 0.5
            },
            accountMaxBalance: {
                value: '',
                valid: false
            },
            validOrderOverLimit: {
                valid: true
            },
            loading: false
        };
        this.handlerInfoConfirm = this.handlerInfoConfirm.bind(this);
    }

    componentDidMount() {
        // data by props
        this.defaultDataFun();
    }

    async defaultDataFun() {
        const requestUrl = `${Utils.requestUrl('test')}/api/bank/default_data`;
        const defaultData = await PopupAPI.getBankDefaultData(requestUrl);
        this.setState({
            rentNumMin: defaultData.rental_amount_min / Math.pow(10, 6),
            rentNumMax: defaultData.rental_amount_max / Math.pow(10, 6),
            rentDayMin: defaultData.rental_days_min,
            rentDayMax: defaultData.rental_days_max,
            rentUnit: {
                num: defaultData.energy / 10000,
                day: defaultData.days,
                cost: defaultData.pay_amount / Math.pow(10, 6)
            },
            defaultUnit: {
                num: defaultData.energy / 10000,
                day: defaultData.days,
                cost: defaultData.pay_amount / Math.pow(10, 6)
            }
        });
    }

    async calculateRentCost() {
        // calculate bank rent cost
        const requestUrl = `${Utils.requestUrl('test')}/api/bank/pay_amount`;
        const { recipient, rentNum, rentDay, defaultUnit } = this.state;
        const { selected } = this.props.accounts;
        const address = selected.address;
        const rentDayValue = rentDay.value;
        console.log(`默认传值的数量${rentDayValue},${rentDay.value}`);
        let recipientAddress;
        if(recipient.value === '') recipientAddress = address; else recipientAddress = recipient.value;
        if(recipient.valid && rentNum.valid && rentDay.valid ) {
            console.log(`天数${rentDayValue}`);
            const calculateData = await PopupAPI.calculateRentCost(
                recipientAddress,
                rentNum.value * Math.pow(10, 6),
                rentDayValue,
                requestUrl
            );
            this.setState({
                rentUnit: {
                    num: calculateData.ratio,
                    cost: calculateData.payAmount / Math.pow(10, 6)
                }
            });
        }else {
            this.setState({
                rentUnit: defaultUnit
            });
        }
    }

    onRecipientChange(e, _type) {
        //reacipientchange  judge account isvalid by _type
        const address = e.target.value;
        const recipient = {
            value: address,
            valid: BANK_STATE.INVALID,
            error: BANK_STATE.INVALID
        };
        const validOrderOverLimit = {
            valid: BANK_STATE.INVALID
        };
        if(!address.length) {
            recipient.valid = true;
            recipient.error = false;
            this.setState({
                recipient
            }, () => {
                this.calculateRentCost();
            });
            if(_type === 2) this.isValidRentAddress(address);
            return;
        }
        if(!TronWeb.isAddress(address)) {
            recipient.valid = false;
            validOrderOverLimit.valid = true;
            if(_type === 2) recipient.error = true; else recipient.error = false;
        }
        else {
            recipient.valid = true;
            recipient.error = false;
            if(_type === 2) this.isValidRentAddress();
        }
        this.setState({
            recipient,
            validOrderOverLimit
        }, () => {
            this.calculateRentCost();
        });
    }

    async isValidRentAddress() {
        // valid order num > 3
        let address = this.rentAddressInput.value;
        const { selected } = this.props.accounts;
        const selectedaAddress = selected.address;
        if(address === '') address = selectedaAddress;
        const requestUrl = `${Utils.requestUrl('test')}/api/bank/is_rent`;
        const isRentDetail = await PopupAPI.isValidOrderAddress(address, requestUrl);
        this.setState({
            validOrderOverLimit: {
                valid: isRentDetail.isRent
            }
        });
        const recipient = {
            value: address,
            error: BANK_STATE.INVALID,
            valid: BANK_STATE.INVALID
        };
        if(!isRentDetail.isRent) recipient.valid = false; else recipient.valid = true;
        this.setState({ recipient });
    }

    async handlerRentNumChange(e, _type) {
        // rent num change  _type 1chage 2blur
        const { rentNumMin, rentNumMax } = this.state;
        const rentVal = e.target.value;
        const rentNum = {
            value: rentVal,
            predictVal: '',
            predictStatus: BANK_STATE.INVALID,
            valid: BANK_STATE.INVALID,
            error: BANK_STATE.INVALID
        };
        if(!rentVal.length)
            return this.setState({ rentNum });

        if(Utils.validatInteger(rentVal) && rentVal <= rentNumMax && rentVal >= rentNumMin) {
            if(_type === 2) {
                const { selected, accounts } = this.props.accounts;
                const address = selected.address;
                const { TotalEnergyWeight } = await NodeService.tronWeb.trx.getAccountResources(address);
                if(Number.isFinite(TotalEnergyWeight)) rentNum.predictVal = Math.ceil(rentVal / TotalEnergyWeight * 50000000000);
                else rentNum.predictVal = 0;
                rentNum.predictStatus = true;
                // account balance very small
                const balanceAry = [];
                Object.values(accounts).map(v => { return balanceAry.push(v.balance); });
                const accountMaxBalance = {
                    value: '',
                    valid: BANK_STATE.INVALID
                };
                accountMaxBalance.value = Math.max(...balanceAry);
                if(rentVal > Math.max(...balanceAry)) accountMaxBalance.valid = true; else accountMaxBalance.valid = false;
                this.setState({ accountMaxBalance });
            }
            rentNum.valid = true;
            rentNum.error = false;
            // this.setState({
            //     rentNum
            // });
            // this.calculateRentCost();
        } else {
            rentNum.valid = false;
            rentNum.predictStatus = false;
            if(_type === 2) rentNum.error = true; else rentNum.error = false;
        }
        this.setState({
            rentNum
        }, () => { this.calculateRentCost(); });
    }

    handlerRentDayChange(e, _type) {
        // handler day change _type 1chage 2blur
        const { rentDayMin, rentDayMax } = this.state;
        const rentVal = e.target.value;
        const rentDay = {
            value: rentVal,
            valid: BANK_STATE.INVALID,
            error: BANK_STATE.INVALID
        };
        if(!rentVal.length)
            return this.setState({ rentDay });

        if(!Utils.validatInteger(rentVal)) {
            rentDay.value = rentDayMin;
            rentDay.valid = false;
            rentDay.error = true;
            rentDay.maxError = false;
            this.setState({
                rentDay
            });
            return;
        }

        if(rentVal <= rentDayMax && rentVal >= rentDayMin) {
            if(_type === 2) {
                rentDay.valid = true;
                console.log(rentDay);
                // this.setState({
                //     rentDay
                // }, () => {
                //     this.calculateRentCost();
                // });
            }
            rentDay.error = false;
        } else {
            rentDay.valid = false;
            if(_type === 2) {
                if(rentVal < rentDayMin ) {
                    rentDay.value = rentDayMin;
                    rentDay.error = true;
                    rentDay.maxError = false;
                }
                if(rentVal > rentDayMax) {
                    rentDay.value = rentDayMax;
                    rentDay.error = false;
                    rentDay.maxError = true;
                }
            }else {
                rentDay.error = false;
                rentDay.maxError = false;
            }
        }
        // this.setState({
        //     rentDay
        // });
        this.setState({
            rentDay
        }, () => {
            this.calculateRentCost();
        });
    }

    handlerRentDayFun(_type) {
        // _type 1reduce 2add
        const { rentDayMin, rentDayMax } = this.state;
        let rentVal = this.rentDayInput.value;
        const rentDay = {
            value: '',
            valid: BANK_STATE.INVALID,
            error: BANK_STATE.INVALID,
            maxError: BANK_STATE.INVALID
        };

        if(!Utils.validatInteger(rentVal)) {
            rentDay.value = rentDayMin;
            rentDay.valid = false;
            rentDay.error = true;
            rentDay.maxError = false;
            this.setState({
                rentDay
            });
            return;
        }
        rentVal = Number(rentVal); // valid number
        if(_type === 1) {
            if(rentVal <= rentDayMin ) {
                rentDay.value = rentDayMin;
                rentDay.valid = false;
                rentDay.error = true;
                rentDay.maxError = false;
            }else {
                if(rentVal > rentDayMax) {
                    rentDay.valid = false;
                    rentDay.error = false;
                    rentDay.maxError = true;
                    rentDay.value = rentDayMax;
                }else{
                    rentDay.value = rentVal - 1;
                    rentDay.valid = true;
                    rentDay.error = false;
                    rentDay.maxError = false;
                    // this.setState({
                    //     rentDay
                    // }, () => {
                    //     this.calculateRentCost();
                    // });
                }
            }
        }
        else {
            if(rentVal >= rentDayMax ) {
                rentDay.value = rentDayMax;
                rentDay.valid = false;
                rentDay.maxError = true;
            }else {
                if(rentVal === 0) rentVal = 2;
                rentDay.value = rentVal + 1;
                rentDay.valid = true;
                rentDay.maxError = false;
                // this.setState({
                //     rentDay
                // }, () => {
                //     this.calculateRentCost();
                // });
            }
            rentDay.error = false;
        }
        // this.setState({
        //     rentDay
        // });
        this.setState({
            rentDay
        }, () => {
            this.calculateRentCost();
        });
    }

    handlerInfoConfirm() {
        // InfoConfirm
        // const { formatMessage } = this.props.intl;
        // const { recipient, rentNum, rentDay } = this.state;
        // Toast.info( formatMessage({ id: 'BANK.RENTINFO.INSUFFICIENT' }), 1);
        this.setState({
            rentConfirmVisible: true
        });
    }

    rentDealSendFun(e) {
        //send msg  entrustOrder(freezeAmount,payAmount,_days,Addr)  payAmount = freezeAmount*_days*0.1
        const { formatMessage } = this.props.intl;
        const { rentNum, rentDay, recipient } = this.state;
        const { selected } = this.props.accounts;
        const address = selected.address;
        const rentDayValue = Number(rentDay.value);
        const freezeAmount = rentNum.value * Math.pow(10, 6);
        const payAmount = freezeAmount * 0.1 * rentDayValue;
        let recipientAddress;
        if(recipient.value === '') recipientAddress = address; else recipientAddress = recipient.value;
        console.log({ freezeAmount, payAmount, rentDayValue, recipientAddress });
        PopupAPI.rentEnergy(
            freezeAmount,
            payAmount,
            rentDayValue,
            recipientAddress
        ).then(() => {
            Toast.info(formatMessage({ id: 'BANK.RENTINFO.SUCCESS' }), 4);
            this.setState({ rentConfirmVisible: false });
        }).catch(error => {
            console.log(error);
            Toast.fail(JSON.stringify(error.error), 2);
        });
    }

    onModalClose = key => () => {
        this.setState({
            [ key ]: false,
        });
    };

    render() {
        const { formatMessage } = this.props.intl;
        const { accounts, selected } = this.props.accounts;
        const { recipient, rentNum, rentDay, rentNumMin, rentNumMax, rentDayMin, rentDayMax, rentUnit, accountMaxBalance, validOrderOverLimit } = this.state;
        let recipientVal;
        if(recipient.value === '') recipientVal = selected.address; else recipientVal = recipient.value;
        const orderList = [
            { id: 'BANK.RENTINFO.PAYADDRESS', user: 1, value: selected.address },
            { id: 'BANK.RENTINFO.RECEIVEADDRESS', user: 1, value: recipientVal },
            { id: 'BANK.RENTINFO.RENTNUM', tip: 1, value: `${rentNum.value}TRX` },
            { id: 'BANK.RENTINFO.RENTDAY', type: 3, value: rentDay.value },
            { id: 'BANK.RENTINFO.PAYNUM', type: 0, value: `${rentUnit.cost}TRX` },
        ];
        const myImg = src => { return require(`../../assets/images/new/tronBank/${src}.svg`); };
        return (
            <div className='TronBankContainer'>
                <NavBar
                    className='navbar'
                    mode='light'
                    icon={<div className='commonBack'></div>}
                    onLeftClick={() => PopupAPI.changeState(APP_STATE.READY)}
                    rightContent={<img onClick={() => { this.setState({ popoverVisible: !this.state.popoverVisible }); }} className='rightMore' src={myImg('more')} alt={'more'}/>}
                >TronBank
                </NavBar>
                {/* navModal */}
                <div className='navBarMoreMenu' onClick={(e) => { e.stopPropagation();this.setState({ popoverVisible: !this.state.popoverVisible }); } }>
                    <div className={ this.state.popoverVisible ? 'dropList menuList menuVisible' : 'dropList menuList'}>
                        <div onClick={ () => { PopupAPI.changeState(APP_STATE.TRONBANK_RECORD); } } className='item'>
                            <img onClick={() => { this.setState({ popoverVisible: true }); }} className='rightMoreIcon' src={myImg('record')} alt={'record'}/>
                            <FormattedMessage id='BANK.RENTNUMMODAL.RECORD' />
                        </div>
                        <div onClick={(e) => { console.log('TODO'); }} className='item'>
                            <img onClick={() => { this.setState({ popoverVisible: true }); }} className='rightMoreIcon' src={myImg('help')} alt={'help'}/>
                            <FormattedMessage id='BANK.RENTNUMMODAL.HELP' />
                        </div>
                    </div>
                </div>
                <div className='bankContent'>
                    {/* account pay,receive */}
                    <div className='accountContent'>
                        <section className='accountInfo infoSec'>
                            <label><FormattedMessage id='ACCOUNT.SEND.PAY_ACCOUNT'/></label>
                            <div className='selectedAccount'>
                                <FormattedMessage id='BANK.INDEX.ACCOUNT'/>一<span>{ selected.address }</span>
                            </div>
                            <div className='balance'>
                                <FormattedMessage id='BANK.INDEX.BALANCE' values={{ amount: selected.balance / Math.pow(10, 6) }}/>
                            </div>
                        </section>
                        <section className='infoSec'>
                            <label><FormattedMessage id='ACCOUNT.SEND.RECEIVE_ADDRESS'/></label>
                            <div className={recipient.error ? 'receiveAccount errorBorder' : 'receiveAccount normalBorder'}>
                                <input ref={ rentAddressInput => this.rentAddressInput = rentAddressInput}
                                    onChange={(e) => { this.onRecipientChange(e, 1); } }
                                    onBlur={(e) => this.onRecipientChange(e, 2)}
                                    placeholder={ formatMessage({ id: 'BANK.INDEX.PLACEHOLDER', values: { min: rentNumMin } })}
                                />
                            </div>
                            { recipient.error ? <div className='errorMsg'><FormattedMessage id='BANK.INDEX.RECEIVEERROR'/></div> : null }
                            { !validOrderOverLimit.valid ? <div className='errorMsg'><FormattedMessage id='BANK.INDEX.OVERTAKEORDERNUM'/></div> : null }
                            <div className='balance'>
                                <FormattedMessage id='BANK.INDEX.USED' values={{ num: accounts[ selected.address ].energy - accounts[ selected.address ].energyUsed }} />/<FormattedMessage id='BANK.INDEX.TOTAL' values={{ total: accounts[ selected.address ].energy }}/>
                            </div>
                        </section>
                    </div>
                    {/* rent num,day */}
                    <div className='rentContent'>
                        <section className='infoSec'>
                            <label>
                                <FormattedMessage id='BANK.INDEX.RENTNUM'/>
                                <img onClick={() => { this.setState({ rentModalVisible: true }); }}
                                    className='rentNumEntrance'
                                    src={myImg('question')}
                                    alt={'question'}
                                />
                            </label>
                            <div className={rentNum.error ? 'rentNumWrapper errorBorder' : 'rentNumWrapper normalBorder'}>
                                <input value={ rentNum.value }
                                    onChange={ (e) => { this.handlerRentNumChange(e, 1); }}
                                    onBlur={ (e) => this.handlerRentNumChange(e, 2)}
                                    className='commonInput rentNumInput'
                                    placeholder={ formatMessage({ id: 'BANK.INDEX.FREEZEPLACEHOLDER' }) + `（${rentNumMin}-${rentNumMax}）`}
                                /><span>TRX</span>
                            </div>
                            { rentNum.error ? <div className='errorMsg'><FormattedMessage id='BANK.INDEX.RENTNUMERROR'/></div> : null}
                            { rentNum.predictStatus ? <div className='predictMsg'><FormattedMessage id='BANK.INDEX.FORECASTNUM' values={{ num: rentNum.predictVal }}/></div> : null}
                            { accountMaxBalance.valid ? <div className='errorMsg'><FormattedMessage id='BANK.INDEX.OVERTAKEMAXNUM' values={{ max: accountMaxBalance.value }} /></div> : null}
                        </section>
                        <section className='infoSec singlgeSty'>
                            <label><FormattedMessage id='BANK.INDEX.RENTDAY'/></label>
                            <div className='dayRange'>
                                <span onClick={ (e) => this.handlerRentDayFun(1)}>
                                    <Button className='operatingBtn'
                                        icon={<img className='operationReduceIcon' src={myImg('subtrac')} alt='subtrac' />}
                                        inline
                                        size='small'
                                    >
                                    </Button>
                                </span>
                                <input value={rentDay.value}
                                    ref={rentDayInput => this.rentDayInput = rentDayInput}
                                    onChange={ (e) => { this.handlerRentDayChange(e, 1); }}
                                    onBlur={ (e) => { this.handlerRentDayChange(e, 2); }}
                                    className='commonInput rentDay'
                                    placeholder={ formatMessage({ id: 'BANK.INDEX.RENTPLACEHOLDER' }) + `(${rentDayMin}-${rentDayMax})`} type='text'
                                />
                                <span onClick={ (e) => this.handlerRentDayFun(2)}>
                                    <Button className='operatingBtn' icon={<img className='operationAddIcon' src={myImg('add')} alt='add' />} inline size='small'>
                                    </Button>
                                </span>
                            </div>
                            { rentDay.error ? <div className='errorMsg rentError'><FormattedMessage id='BANK.INDEX.RENTDAYERROR' values={{ min: rentDayMin }}/></div> : null}
                            { rentDay.maxError ? <div className='errorMsg rentError'><FormattedMessage id='BANK.INDEX.RENTDAYMAXERROR' values={{ max: rentDayMax }}/></div> : null}
                        </section>
                        {rentNum.valid && rentDay.valid ?
                            <section className='calculation'>
                                {rentNum.value}TRX*{rentUnit.num}({rentDay.value}<FormattedMessage id='BANK.INDEX.RENTDAYUNIT'/>)<FormattedMessage id='BANK.INDEX.RENTCONST' /> {rentUnit.cost} TRX
                            </section> :
                            <section className='rentIntroduce'>
                                <FormattedMessage id='BANK.INDEX.RENTINTRODUCE' values={{ ...rentUnit }} />
                            </section>
                        }
                    </div>
                    {/* tronBank submit */}
                    <Button disabled={recipient.valid && rentNum.valid && rentDay.valid ? false : true }
                        className={recipient.valid && rentNum.valid && rentDay.valid ? 'bankSubmit normalValid' : 'bankSubmit inValid'}
                        onClick = {this.handlerInfoConfirm }
                    >
                        <FormattedMessage id='BANK.INDEX.BUTTON'/>
                    </Button>
                </div>
                {/*rentNum modal */}
                <Modal
                    className='modalContent'
                    wrapClassName='modalWrap'
                    visible={this.state.rentModalVisible}
                    transparent
                    maskClosable={false}
                    onClose={this.onModalClose('rentModalVisible')}
                    title={ formatMessage({ id: 'BANK.RENTNUMMODAL.TITLE' })}
                    afterClose={() => { console.log('afterClose'); }}
                >
                    <div className='rentIntroduceCont'>
                        <section className='modalRentContent'>
                            <FormattedMessage id='BANK.RENTNUMMODAL.CONTENT'/>
                        </section>
                        <Button className='modalCloseBtn' onClick={() => { this.onModalClose('rentModalVisible')(); }} size='small'><FormattedMessage id='BANK.RENTNUMMODAL.BUTTON'/></Button>
                    </div>
                </Modal>
                <Modal
                    className='modalContent confirmContentModal'
                    wrapClassName='modalConfirmWrap'
                    visible={this.state.rentConfirmVisible}
                    transparent
                    maskClosable={true}
                    onClose={this.onModalClose('rentConfirmVisible')}
                    title={ formatMessage({ id: 'BANK.RENTINFO.CONFIRM' })}
                    afterClose={() => { console.log('afterClose'); }}
                >
                    <div className='rentIntroduceCont'>
                        <section className='modalRentContent confirmRentContent'>
                            <section className='detailContent'>
                                {orderList.map((val, key) => (
                                    <div key={key} className='orderList' >
                                        <span className='orderIntroduce' >
                                            <FormattedMessage id={val.id}/>
                                        </span>
                                        <span className='orderStatus'>
                                            {val.user === 1 ? `${val.value.substr(0, 4)}...${val.value.substr(-12)}` : val.value }
                                            {val.tip === 1 ? <FormattedMessage id='BANK.RENTINFO.TIPS' values={{ num: rentNum.predictVal }} /> : null}
                                            {val.type === 3 ? <FormattedMessage id='BANK.RENTRECORD.TIMEUNIT'/> : null}
                                        </span>
                                    </div>
                                ))}
                            </section>
                        </section>
                        <section className='operateBtn'>
                            <Button className='modalCloseBtn confirmClose' onClick={() => { this.onModalClose('rentConfirmVisible')(); }} ><FormattedMessage id='BANK.RENTINFO.CANCELBTN'/></Button>
                            <Button className='modalPayBtn' onClick={ (e) => { this.rentDealSendFun(e); }}><FormattedMessage id='BANK.RENTINFO.PAYBTN'/></Button>
                        </section>
                    </div>
                </Modal>
            </div>
        );
    }
}

export default injectIntl(BankController);