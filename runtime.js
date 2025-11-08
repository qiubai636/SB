// Solana版运行时引擎
// Solana DApp核心交互逻辑

// ============ 导入认证模块 ============
// 注意：在生产环境中，请确保 auth.js 文件已正确部署
// import { loginOrRegister, getUserData, getCurrentUserData, clearUserData, completeTask } from './auth.js';

// 临时内联认证函数（如果无法使用 ES6 modules，请使用此版本）
// 实际部署时，建议使用上面的 import 语句
let loginOrRegister, getUserData, getCurrentUserData, clearUserData, completeTask, getLeaderboard;
if (typeof window !== 'undefined' && window.authModule) {
    ({ loginOrRegister, getUserData, getCurrentUserData, clearUserData, completeTask, getLeaderboard } = window.authModule);
} else {
    // 临时实现（仅用于开发，生产环境应使用实际的 auth.js）
    loginOrRegister = async () => { console.warn('auth.js 未加载'); };
    getUserData = async () => { console.warn('auth.js 未加载'); };
    getCurrentUserData = () => null;
    clearUserData = () => {};
    completeTask = async () => { console.warn('auth.js 未加载'); };
    getLeaderboard = async () => { console.warn('auth.js 未加载'); };
}

// ============ Solana程序配置 ============
const GAME_PROGRAM_ID = '';
const INVITATION_PROGRAM_ID = '';
const REWARD_SPL_TOKEN_MINT_ADDRESS = '';
const SOLANA_NETWORK = 'mainnet-beta'; // 'mainnet-beta' or 'devnet'

const IS_GAME_PROGRAM_CONFIGURED = !!(GAME_PROGRAM_ID && GAME_PROGRAM_ID.trim());
const IS_INVITATION_PROGRAM_CONFIGURED = !!(INVITATION_PROGRAM_ID && INVITATION_PROGRAM_ID.trim());

if (!IS_GAME_PROGRAM_CONFIGURED) {
    console.warn('Game Program ID 未配置，相关游戏功能将在导出包中被禁用。');
}

if (!IS_INVITATION_PROGRAM_CONFIGURED) {
    console.warn('Invitation Program ID 未配置，邀请功能将在导出包中被禁用。');
}

// ============ 游戏奖励配置 ============
// 从window全局变量获取游戏奖励列表
const REWARDS_LIST = window.GAME_REWARDS_CONFIG || [];

// ============ 全局变量 ============
let userPublicKey = null;      // 当前用户的钱包公钥
let connection = null;          // Solana RPC连接
let gameProgram = null;         // GameController程序实例
let invitationProgram = null;   // InvitationTracker程序实例
let consumedAllowance = 0;      // 当前会话中已消耗的游戏额度（SOL）
let presaleOnlyMode = false;    // 预售模式状态
let gameConfig = null;          // 游戏配置（从链上读取）

// ============ Solana网络RPC端点 ============
const RPC_ENDPOINTS = {
    'mainnet-beta': 'https://api.mainnet-beta.solana.com',
    'devnet': 'https://api.devnet.solana.com'
};

/**
 * 渲染器类 - 负责根据配置动态渲染UI组件
 */
class Renderer {
    constructor() {
        this.appRoot = null;
        this.componentTemplates = new Map();
        this.eventHandlers = new Map();
    }

    /**
     * 初始化渲染器
     */
    async init() {
        this.appRoot = document.getElementById('app-root');
        if (!this.appRoot) {
            throw new Error('未找到 app-root 元素');
        }
        
        console.log('Solana渲染器初始化完成');
    }

    /**
     * 根据页面配置渲染组件
     * @param {Object} pageConfig - 页面配置对象
     */
    async renderPage(pageConfig) {
        if (!pageConfig || !pageConfig.components) {
            console.warn('页面配置无效或缺少组件配置');
            return;
        }

        console.log('Solana页面渲染完成');
    }

    /**
     * 绑定页面事件
     */
    bindEvents() {
        console.log('绑定Solana事件');
    }
}

/**
 * 运行时引擎主类
 */
class SolanaDAppRuntime {
    constructor() {
        this.renderer = new Renderer();
        this.isInitialized = false;
    }

    /**
     * 初始化运行时引擎
     */
    async init() {
        if (this.isInitialized) {
            console.warn('Solana运行时引擎已经初始化');
            return;
        }

        try {
            console.log('初始化Solana DApp运行时引擎...');

            // 初始化渲染器
            await this.renderer.init();

            // 创建Solana RPC连接
            this.initSolanaConnection();

            // 初始化钱包连接系统
            await this.initWalletSystem();

            // 初始化邀请系统
            await this.initInvitationSystem();

            // 绑定游戏相关按钮
            this.bindGameButtons();

            // 绑定邀请相关按钮
            this.bindInviteButtons();

            // 绑定登录相关按钮
            this.bindLoginButtons();

            // 绑定排行榜相关按钮
            this.bindLeaderboardButtons();

            // 隐藏EVM钱包连接按钮（如果存在）
            this.hideEVMWalletButton();

            // 绑定 userDataUpdated 事件监听器，自动更新所有积分显示
            this.bindUserDataUpdateEvents();

            this.isInitialized = true;
            console.log('Solana DApp运行时引擎初始化完成');

        } catch (error) {
            console.error('Solana运行时引擎初始化失败:', error);
        }
    }

    /**
     * 创建Solana RPC连接
     */
    initSolanaConnection() {
        const endpoint = RPC_ENDPOINTS[SOLANA_NETWORK] || RPC_ENDPOINTS['devnet'];
        connection = new solanaWeb3.Connection(endpoint, 'confirmed');
        console.log('已连接到Solana网络:', SOLANA_NETWORK, 'RPC:', endpoint);
    }

    /**
     * 初始化钱包连接系统
     */
    async initWalletSystem() {
        // 检查Phantom钱包是否已安装
        if (typeof window.solana === 'undefined' || !window.solana.isPhantom) {
            console.warn('未检测到Phantom钱包');
            const solanaWalletBtn = document.getElementById('connect-solana-wallet-btn');
            if (solanaWalletBtn) {
                solanaWalletBtn.disabled = true;
                solanaWalletBtn.textContent = '⚠️ 请安装Phantom钱包';
            }
            return;
        }

        // 尝试自动连接（如果之前已授权）
        try {
            const response = await window.solana.connect({ onlyIfTrusted: true });
            if (response && response.publicKey) {
                this.handleWalletConnect(response.publicKey);
            }
        } catch (error) {
            console.log('Phantom未自动连接，等待用户点击');
        }

        // 绑定连接按钮
        const connectBtn = document.getElementById('connect-solana-wallet-btn');
        if (connectBtn) {
            connectBtn.addEventListener('click', async () => {
                await this.connectPhantomWallet();
            });
        }
    }

    /**
     * 连接Phantom钱包
     */
    async connectPhantomWallet() {
        try {
            const connectBtn = document.getElementById('connect-solana-wallet-btn');
            if (connectBtn) {
                connectBtn.disabled = true;
                connectBtn.textContent = '连接中...';
            }

            // 请求连接
            const response = await window.solana.connect();
            
            if (response && response.publicKey) {
                this.handleWalletConnect(response.publicKey);
            }

        } catch (error) {
            console.error('连接Phantom钱包失败:', error);
            
            const connectBtn = document.getElementById('connect-solana-wallet-btn');
            if (connectBtn) {
                connectBtn.disabled = false;
                connectBtn.textContent = '⭐ 连接Solana钱包 (Phantom)';
                
                // 显示错误提示
                alert('连接钱包失败: ' + error.message);
            }
        }
    }

    /**
     * 处理钱包连接成功
     * @param {Object} publicKey - 用户公钥
     */
    handleWalletConnect(publicKey) {
        userPublicKey = publicKey;
        console.log('Phantom钱包已连接:', publicKey.toBase58());

        // 更新按钮状态
        const connectBtn = document.getElementById('connect-solana-wallet-btn');
        if (connectBtn) {
            connectBtn.textContent = `✅ 已连接 ${publicKey.toBase58().substring(0, 6)}...`;
            connectBtn.disabled = false;
        }

        // 初始化程序实例
        this.initSolanaPrograms();

        // 加载游戏配置（包括预售模式）
        await this.loadGameConfig();

        // 更新UI
        this.updateGamePrice();
        this.updateMilestoneStatus();
        this.updateReferralBalance();
        this.updatePlayCountStatus();

        // 检查并渲染任务列表
        this.renderTasks();

        // 获取并更新用户状态
        const walletAddress = publicKey.toBase58();
        try {
            const userData = await getUserData(walletAddress);
            this.updateUserStatusUI(userData);
        } catch (error) {
            console.error('获取用户数据失败:', error);
        }
    }

    /**
     * 初始化Solana程序实例
     */
    initSolanaPrograms() {
        try {
            // 只有在配置不为空时才初始化程序
            if (GAME_PROGRAM_ID && GAME_PROGRAM_ID.trim() !== '') {
                const gameProgramId = new solanaWeb3.PublicKey(GAME_PROGRAM_ID);
                console.log('Game Program ID:', GAME_PROGRAM_ID);
            } else {
                console.warn('Game Program ID 未配置，相关功能将不可用');
            }
            
            // 初始化InvitationTracker程序
            if (INVITATION_PROGRAM_ID && INVITATION_PROGRAM_ID.trim() !== '') {
                const invitationProgramId = new solanaWeb3.PublicKey(INVITATION_PROGRAM_ID);
                console.log('Invitation Program ID:', INVITATION_PROGRAM_ID);
            } else {
                console.warn('Invitation Program ID 未配置，相关功能将不可用');
            }

            console.log('Solana程序实例已初始化');

        } catch (error) {
            console.error('初始化Solana程序失败:', error);
        }
    }

    /**
     * 初始化邀请系统
     */
    async initInvitationSystem() {
        // 解析URL中的邀请人地址
        this.parseInviteCode();

        // 等待钱包连接后初始化
        document.addEventListener('wallet-connected', async () => {
            await this.generateInviteLink();
            await this.updateMilestoneStatus();
            await this.updateReferralBalance();
        });
    }

    /**
     * 解析URL中的邀请人地址
     */
    parseInviteCode() {
        const urlParams = new URLSearchParams(window.location.search);
        const ref = urlParams.get('ref');
        
        if (ref) {
            // 将邀请人地址保存到 sessionStorage
            sessionStorage.setItem('inviterAddress', ref);
            console.log('检测到邀请链接，邀请人地址已保存:', ref);
        }
    }

    /**
     * 生成邀请链接
     */
    async generateInviteLink() {
        if (!userPublicKey) {
            console.warn('用户未连接钱包，无法生成邀请链接');
            return;
        }

        try {
            const userAddress = userPublicKey.toBase58();
            const currentUrl = window.location.origin + window.location.pathname;
            const inviteLink = `${currentUrl}?ref=${userAddress}`;

            // 更新UI
            const linkElement = document.getElementById('user-invite-link');
            if (linkElement) {
                linkElement.textContent = inviteLink;
            }

            console.log('邀请链接已生成:', inviteLink);
        } catch (error) {
            console.error('生成邀请链接失败:', error);
        }
    }

    /**
     * 绑定游戏相关按钮
     */
    bindGameButtons() {
        // 开始游戏按钮
        const playButtons = document.querySelectorAll('.lottery-button[data-action="lottery-trigger"]');
        playButtons.forEach(playButton => {
            playButton.addEventListener('click', async () => {
                await this.handlePlayGame(playButton);
            });
        });
    }

    /**
     * 处理游戏开始
     */
    async handlePlayGame(playButton) {
        if (!IS_GAME_PROGRAM_CONFIGURED) {
            console.warn('Game Program ID 未配置，游戏功能已禁用。');
            return;
        }

        if (!userPublicKey) {
            alert('请先连接Phantom钱包');
            return;
        }

        if (!gameProgram) {
            alert('游戏程序未初始化');
            return;
        }

        // 检查预售模式和白名单
        if (presaleOnlyMode) {
            const userData = getCurrentUserData();
            if (!userData || !userData.is_whitelisted) {
                alert('预售进行中，仅限白名单用户参与');
                return;
            }
        }

        // 获取用户数据和游戏价格
        const userData = getCurrentUserData();
        if (!userData) {
            alert('请先登录');
            return;
        }

        // 获取游戏价格（从全局配置或从链上读取）
        const playPrice = parseFloat(window.PLAY_PRICE || '0.001'); // 默认0.001 SOL
        const playAllowance = userData.play_allowance_sol || 1;
        
        // 核心验证：检查游戏额度
        const newConsumedAmount = consumedAllowance + playPrice;
        if (newConsumedAmount > playAllowance) {
            alert('您的游戏额度已用完！请通过完成更多任务来提升积分，以获得更高的额度。\n\n当前额度：' + playAllowance + ' SOL\n已消耗：' + consumedAllowance.toFixed(4) + ' SOL\n本次需要：' + playPrice + ' SOL');
            return;
        }

        try {
            // 禁用按钮，显示加载状态
            playButton.disabled = true;
            const originalText = playButton.textContent;
            playButton.textContent = '处理中...';

            // 从 sessionStorage 读取邀请人地址
            const inviterAddress = sessionStorage.getItem('inviterAddress') || null;

            // TODO: 构建并发送Solana交易
            console.log('开始Solana游戏...', { userPublicKey, inviterAddress, playPrice });

            // 模拟交易确认
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 交易成功后，累加已消耗额度
            consumedAllowance += playPrice;
            console.log('游戏完成，已消耗额度：', consumedAllowance, 'SOL');

            // 刷新用户数据（积分可能已更新）
            const walletAddress = userPublicKey.toBase58();
            const updatedUserData = await getUserData(walletAddress);
            this.updateUserStatusUI(updatedUserData);

            alert('游戏完成！Solana版本功能开发中...');

            // 恢复按钮状态
            playButton.textContent = originalText;
            playButton.disabled = false;

        } catch (error) {
            console.error('游戏失败:', error);
            alert('游戏失败: ' + error.message);
            
            playButton.textContent = originalText;
            playButton.disabled = false;
        }
    }

    /**
     * 绑定邀请相关按钮
     */
    bindInviteButtons() {
        // 复制链接按钮
        const copyLinkButtons = document.querySelectorAll('[data-action="copy-link"]');
        copyLinkButtons.forEach(copyLinkButton => {
            copyLinkButton.addEventListener('click', async () => {
                const linkElement = document.getElementById('user-invite-link');
                if (linkElement) {
                    try {
                        await navigator.clipboard.writeText(linkElement.textContent);
                        const originalText = copyLinkButton.textContent;
                        copyLinkButton.textContent = '已复制！';
                        setTimeout(() => {
                            copyLinkButton.textContent = originalText;
                        }, 2000);
                    } catch (error) {
                        console.error('复制失败:', error);
                        alert('复制失败: ' + error.message);
                    }
                }
            });
        });

        // 里程碑奖励领取按钮
        const claimMilestoneButton = document.getElementById('claim-milestone-reward-btn');
        if (claimMilestoneButton) {
            claimMilestoneButton.addEventListener('click', async () => {
                await this.handleClaimReward();
            });
        }

        // 返佣提取按钮
        const withdrawReferralButton = document.getElementById('withdraw-referral-fees-btn');
        if (withdrawReferralButton) {
            withdrawReferralButton.addEventListener('click', async () => {
                await this.handleWithdrawReferralFees();
            });
        }
    }

    /**
     * 处理领取里程碑奖励
     */
    async handleClaimReward() {
        if (!IS_INVITATION_PROGRAM_CONFIGURED) {
            console.warn('Invitation Program ID 未配置，里程碑奖励功能已禁用。');
            return;
        }

        if (!userPublicKey) {
            alert('请先连接Phantom钱包');
            return;
        }

        try {
            console.log('领取Solana里程碑奖励...');
            alert('Solana版本功能开发中...');
        } catch (error) {
            console.error('领取奖励失败:', error);
            alert('领取失败: ' + error.message);
        }
    }

    /**
     * 处理提取返佣
     */
    async handleWithdrawReferralFees() {
        if (!IS_GAME_PROGRAM_CONFIGURED) {
            console.warn('Game Program ID 未配置，返佣提取功能已禁用。');
            return;
        }

        if (!userPublicKey) {
            alert('请先连接Phantom钱包');
            return;
        }

        try {
            console.log('提取Solana返佣...');
            alert('Solana版本功能开发中...');
        } catch (error) {
            console.error('提取返佣失败:', error);
            alert('提取失败: ' + error.message);
        }
    }

    /**
     * 更新游戏价格显示
     */
    async updateGamePrice() {
        if (!IS_GAME_PROGRAM_CONFIGURED) {
            console.warn('Game Program ID 未配置，跳过游戏价格更新。');
            return;
        }

        if (!userPublicKey || !connection) {
            console.warn('钱包未连接或RPC未初始化');
            return;
        }

        try {
            // TODO: 从链上读取游戏价格
            console.log('更新Solana游戏价格...');
        } catch (error) {
            console.error('更新游戏价格失败:', error);
        }
    }

    /**
     * 更新玩家游戏次数状态显示
     */
    async updatePlayCountStatus() {
        if (!IS_GAME_PROGRAM_CONFIGURED) {
            console.warn('Game Program ID 未配置，跳过游戏次数状态更新。');
            return;
        }

        if (!userPublicKey || !connection) {
            console.warn('钱包未连接或RPC未初始化');
            return;
        }

        try {
            // TODO: 从链上读取游戏次数和上限
            console.log('更新Solana游戏次数状态...');
        } catch (error) {
            console.error('更新游戏次数状态失败:', error);
        }
    }

    /**
     * 更新里程碑状态
     */
    async updateMilestoneStatus() {
        if (!IS_INVITATION_PROGRAM_CONFIGURED) {
            console.warn('Invitation Program ID 未配置，跳过里程碑状态更新。');
            return;
        }

        if (!userPublicKey || !connection) {
            console.warn('钱包未连接或RPC未初始化');
            return;
        }

        try {
            // TODO: 从链上读取邀请人数
            console.log('更新Solana里程碑状态...');
        } catch (error) {
            console.error('更新里程碑状态失败:', error);
        }
    }

    /**
     * 更新返佣余额
     */
    async updateReferralBalance() {
        if (!IS_GAME_PROGRAM_CONFIGURED) {
            console.warn('Game Program ID 未配置，跳过返佣余额更新。');
            return;
        }

        if (!userPublicKey || !connection) {
            console.warn('钱包未连接或RPC未初始化');
            return;
        }

        try {
            // TODO: 从链上读取返佣余额
            console.log('更新Solana返佣余额...');
        } catch (error) {
            console.error('更新返佣余额失败:', error);
        }
    }

    /**
     * 隐藏EVM钱包连接按钮
     */
    hideEVMWalletButton() {
        const evmWalletBtn = document.getElementById('connect-evm-wallet-btn');
        if (evmWalletBtn) {
            evmWalletBtn.style.display = 'none';
            console.log('已隐藏EVM钱包连接按钮');
        }
    }

    /**
     * 绑定登录相关按钮
     */
    bindLoginButtons() {
        // 绑定登录按钮点击事件
        const loginButtons = document.querySelectorAll('[data-action="open-login-modal"]');
        loginButtons.forEach(button => {
            button.addEventListener('click', () => {
                this.openLoginModal();
            });
        });

        // 绑定登录弹窗关闭按钮
        const closeLoginModalBtn = document.getElementById('close-login-modal');
        const cancelLoginBtn = document.getElementById('cancel-login-btn');
        if (closeLoginModalBtn) {
            closeLoginModalBtn.addEventListener('click', () => {
                this.closeLoginModal();
            });
        }
        if (cancelLoginBtn) {
            cancelLoginBtn.addEventListener('click', () => {
                this.closeLoginModal();
            });
        }

        // 绑定登录/注册按钮
        const signBtn = document.getElementById('login-sign-btn');
        if (signBtn) {
            signBtn.addEventListener('click', async () => {
                await this.handleLoginSign();
            });
        }

        // 检查是否已有登录用户，更新按钮文本
        this.updateLoginButtonText();
    }

    /**
     * 打开登录弹窗
     */
    openLoginModal() {
        const loginModal = document.getElementById('login-modal');
        if (loginModal) {
            loginModal.classList.remove('hidden');
            
            // 如果已经连接钱包，自动填充地址（可选）
            if (userPublicKey) {
                const walletAddressInput = document.getElementById('login-wallet-address');
                if (walletAddressInput) {
                    walletAddressInput.value = userPublicKey.toBase58();
                }
            }
            
            // 启用登录按钮
            const signBtn = document.getElementById('login-sign-btn');
            if (signBtn) {
                signBtn.disabled = false;
            }
        }
    }

    /**
     * 关闭登录弹窗
     */
    closeLoginModal() {
        const loginModal = document.getElementById('login-modal');
        if (loginModal) {
            loginModal.classList.add('hidden');
            
            // 清空表单
            const walletAddressInput = document.getElementById('login-wallet-address');
            const twitterInput = document.getElementById('login-twitter-username');
            const telegramInput = document.getElementById('login-telegram-username');
            if (walletAddressInput) walletAddressInput.value = '';
            if (twitterInput) twitterInput.value = '';
            if (telegramInput) telegramInput.value = '';
        }
    }

    /**
     * 处理登录/注册
     */
    async handleLoginSign() {
        try {
            // 读取用户输入
            const walletAddressInput = document.getElementById('login-wallet-address');
            const twitterInput = document.getElementById('login-twitter-username');
            const telegramInput = document.getElementById('login-telegram-username');
            
            const walletAddress = walletAddressInput ? walletAddressInput.value.trim() : '';
            const twitterUsername = twitterInput ? twitterInput.value.trim() : '';
            const telegramUsername = telegramInput ? telegramInput.value.trim() : '';

            // 验证输入
            if (!walletAddress) {
                alert('Please enter your wallet address');
                return;
            }

            // 验证钱包地址格式（Solana地址通常是44个字符的Base58编码）
            if (walletAddress.length < 32 || walletAddress.length > 44) {
                alert('Invalid wallet address format. Please check your Solana wallet address.');
                return;
            }

            const signBtn = document.getElementById('login-sign-btn');
            if (signBtn) {
                signBtn.disabled = true;
                signBtn.textContent = 'Processing...';
            }

            // 检查Phantom钱包是否已安装
            if (typeof window.solana === 'undefined' || !window.solana.isPhantom) {
                alert('Please install Phantom wallet first');
                if (signBtn) {
                    signBtn.disabled = false;
                    signBtn.textContent = 'Login / Register';
                }
                return;
            }

            // 连接钱包（使用用户输入的钱包地址进行验证）
            let connectedPublicKey = null;
            try {
                const response = await window.solana.connect();
                if (response && response.publicKey) {
                    connectedPublicKey = response.publicKey;
                    const connectedAddress = response.publicKey.toBase58();
                    
                    // 验证连接的钱包地址是否与输入的一致
                    if (connectedAddress.toLowerCase() !== walletAddress.toLowerCase()) {
                        alert(`Wallet address mismatch. Connected: ${connectedAddress.substring(0, 8)}...${connectedAddress.substring(connectedAddress.length - 6)}, but you entered: ${walletAddress.substring(0, 8)}...${walletAddress.substring(walletAddress.length - 6)}. Please connect the correct wallet.`);
                        if (signBtn) {
                            signBtn.disabled = false;
                            signBtn.textContent = 'Login / Register';
                        }
                        return;
                    }
                    
                    userPublicKey = connectedPublicKey;
                }
            } catch (error) {
                console.error('Connect wallet failed:', error);
                alert('Failed to connect wallet: ' + error.message);
                if (signBtn) {
                    signBtn.disabled = false;
                    signBtn.textContent = 'Login / Register';
                }
                return;
            }

            // 创建签名消息
            const timestamp = Date.now();
            const message = `Login DApp - ${timestamp}`;
            const messageBytes = new TextEncoder().encode(message);

            // 请求用户签名
            const signedMessage = await window.solana.signMessage(messageBytes, 'utf8');
            
            if (!signedMessage || !signedMessage.signature) {
                throw new Error('Signature failed');
            }

            // 将签名转换为Base64
            const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signedMessage.signature)));

            // 调用后端API
            const userData = await loginOrRegister(
                walletAddress,
                signatureBase64,
                twitterUsername,
                telegramUsername
            );

            console.log('Login/Register successful:', userData);

            // 关闭弹窗
            this.closeLoginModal();

            // 更新登录按钮文本
            this.updateLoginButtonText(userData.random_name || userData.wallet_address.substring(0, 6));

            // 显示成功提示
            this.showToast('Login successful! Welcome, ' + (userData.random_name || 'User'), 'success');

            // 渲染任务列表
            this.renderTasks();

            // 更新用户状态UI
            this.updateUserStatusUI(userData);

        } catch (error) {
            console.error('Login/Register failed:', error);
            this.showToast('Login failed: ' + error.message, 'error');
            
            const signBtn = document.getElementById('login-sign-btn');
            if (signBtn) {
                signBtn.disabled = false;
                signBtn.textContent = 'Login / Register';
            }
        }
    }

    /**
     * 更新登录按钮文本
     * @param {string} userName - 用户名（可选）
     */
    updateLoginButtonText(userName = null) {
        // 如果没有提供用户名，尝试从 localStorage 获取
        if (!userName) {
            const userData = getCurrentUserData();
            if (userData && userData.random_name) {
                userName = userData.random_name;
            }
        }

        // 更新所有登录按钮的文本
        const loginButtons = document.querySelectorAll('[data-action="open-login-modal"]');
        loginButtons.forEach(button => {
            if (userName) {
                button.textContent = userName;
            } else {
                button.textContent = 'Login / Register';
            }
        });
    }

    /**
     * 渲染任务列表
     */
    renderTasks() {
        // 检查用户是否已登录
        const userData = getCurrentUserData();
        if (!userData || !userData.wallet_address) {
            console.log('用户未登录，无法渲染任务列表');
            return;
        }

        // 查找任务容器
        const tasksContainer = document.getElementById('tasks-container');
        if (!tasksContainer) {
            console.warn('未找到 #tasks-container 元素');
            return;
        }

        // 查找任务列表组件
        const taskListComponent = tasksContainer.closest('[data-component-type="task-list"]');
        if (!taskListComponent) {
            console.warn('未找到任务列表组件');
            return;
        }

        // 获取任务配置
        let tasks = [];
        try {
            const configStr = taskListComponent.dataset.tasksConfig;
            if (configStr && configStr.trim() !== '') {
                tasks = JSON.parse(configStr);
                if (!Array.isArray(tasks)) {
                    tasks = [];
                }
            }
        } catch (e) {
            console.error('解析任务配置失败:', e);
            tasks = [];
        }

        // 清空容器
        tasksContainer.innerHTML = '';

        if (tasks.length === 0) {
            const emptyMessage = document.createElement('li');
            emptyMessage.textContent = '暂无任务';
            emptyMessage.style.cssText = 'text-align: center; color: #718096; padding: 20px; font-size: 14px; list-style: none;';
            tasksContainer.appendChild(emptyMessage);
            return;
        }

        // 从localStorage加载用户的完成任务记录
        const lastTasksCompletion = userData.last_tasks_completion || {};
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        // 遍历任务配置，创建精美的任务条目
        tasks.forEach(task => {
            // 确保任务有ID
            if (!task.id) {
                task.id = 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            }

            // 检查任务今天是否已完成
            const taskCompletion = lastTasksCompletion[task.id];
            const isCompletedToday = taskCompletion && taskCompletion.startsWith(today);

            // 创建任务条目（使用 <a> 链接）
            const taskLink = document.createElement('a');
            taskLink.href = '#';
            taskLink.style.cssText = `
                display: flex;
                align-items: center;
                gap: 16px;
                padding: 16px;
                background: ${isCompletedToday ? '#f3f4f6' : '#ffffff'};
                border: 2px solid ${isCompletedToday ? '#d1d5db' : '#e5e7eb'};
                border-radius: 12px;
                text-decoration: none;
                transition: all 0.2s ease;
                cursor: ${isCompletedToday ? 'not-allowed' : 'pointer'};
                opacity: ${isCompletedToday ? 0.6 : 1};
            `;

            // 如果已完成，添加 completed 类
            if (isCompletedToday) {
                taskLink.classList.add('completed');
            }

            // 左侧：任务图标
            const iconDiv = document.createElement('div');
            iconDiv.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
                width: 48px;
                height: 48px;
                font-size: 24px;
                flex-shrink: 0;
            `;
            iconDiv.textContent = task.icon || '📋';
            taskLink.appendChild(iconDiv);

            // 中间：任务名称和积分
            const contentDiv = document.createElement('div');
            contentDiv.style.cssText = `
                display: flex;
                flex-direction: column;
                gap: 4px;
                flex: 1;
                min-width: 0;
            `;

            const taskName = document.createElement('div');
            const taskStyle = task.style || {};
            const fontSize = taskStyle.fontSize || 16;
            const fontColor = taskStyle.color || '#1f2937';
            taskName.textContent = task.name || '未命名任务';
            taskName.style.cssText = `
                font-size: ${fontSize}px;
                font-weight: 600;
                color: ${fontColor};
                line-height: 1.4;
            `;

            const pointsDiv = document.createElement('div');
            const pointsValue = task.points || 0;
            pointsDiv.textContent = `+${pointsValue} 积分`;
            pointsDiv.style.cssText = `
                font-size: ${fontSize - 2}px;
                font-weight: 500;
                color: #10b981;
                line-height: 1.4;
            `;

            contentDiv.appendChild(taskName);
            contentDiv.appendChild(pointsDiv);
            taskLink.appendChild(contentDiv);

            // 右侧：状态图标
            const statusDiv = document.createElement('div');
            statusDiv.id = `task-status-icon-${task.id}`;
            statusDiv.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                flex-shrink: 0;
                font-size: 20px;
            `;

            if (isCompletedToday) {
                statusDiv.textContent = '✔';
                statusDiv.style.color = '#10b981';
            }

            taskLink.appendChild(statusDiv);

            // 悬停效果（仅未完成时）
            if (!isCompletedToday && task.url && task.url !== '#' && task.url.trim() !== '') {
                taskLink.addEventListener('mouseenter', () => {
                    taskLink.style.borderColor = '#3182ce';
                    taskLink.style.backgroundColor = '#eff6ff';
                    taskLink.style.transform = 'translateY(-2px)';
                    taskLink.style.boxShadow = '0 4px 12px rgba(49, 130, 206, 0.15)';
                });
                taskLink.addEventListener('mouseleave', () => {
                    taskLink.style.borderColor = '#e5e7eb';
                    taskLink.style.backgroundColor = '#ffffff';
                    taskLink.style.transform = 'translateY(0)';
                    taskLink.style.boxShadow = 'none';
                });
            }

            // 绑定点击事件（仅未完成时）
            if (!isCompletedToday && task.url && task.url !== '#' && task.url.trim() !== '') {
                taskLink.addEventListener('click', async (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    // ========== 点击瞬间：立即执行 ==========
                    // 1. 立即禁用该任务链接，防止重复点击
                    taskLink.style.pointerEvents = 'none';
                    taskLink.style.opacity = '0.7';

                    // 2. 在状态区域显示"处理中..."的加载状态
                    statusDiv.innerHTML = '<span style="display: inline-block; width: 16px; height: 16px; border: 2px solid #3182ce; border-top-color: transparent; border-radius: 50%; animation: spin 0.6s linear infinite;"></span>';
                    statusDiv.style.color = '#3182ce';

                    // 3. 立即在新标签页打开任务URL
                    window.open(task.url, '_blank');

                    // 4. 立即调用后端POST /complete-task端点
                    try {
                        if (!userPublicKey) {
                            throw new Error('Please connect wallet first');
                        }

                        // 创建签名消息
                        const timestamp = Date.now();
                        const message = `Complete task - ${task.id} - ${timestamp}`;
                        const messageBytes = new TextEncoder().encode(message);

                        // 请求用户签名
                        const signedMessage = await window.solana.signMessage(messageBytes, 'utf8');
                        
                        if (!signedMessage || !signedMessage.signature) {
                            throw new Error('Signature failed');
                        }

                        // 将签名转换为Base64
                        const signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(signedMessage.signature)));

                        // 调用后端API完成任务
                        const walletAddress = userPublicKey.toBase58();
                        const result = await completeTask(
                            walletAddress,
                            signatureBase64,
                            task.id
                        );

                        console.log('Task submission result:', result);

                        // ========== 等待后端初步确认 ==========
                        // 如果后端返回失败
                        if (!result) {
                            throw new Error('任务提交失败：后端未返回结果');
                        }
                        
                        // 检查是否有错误（但不是pending状态）
                        if (result.error && result.status !== 'pending') {
                            throw new Error(result.error || result.message || '任务提交失败');
                        }

                        // 如果后端返回成功接收（status: 'pending'）
                        // 注意：后端应该返回 status: 'pending' 表示任务已提交到延迟队列
                        if (result.status === 'pending') {
                            console.log('任务已提交到延迟队列，启动2分钟定时器...');
                            // ========== 启动"延迟确认"定时器 ==========
                            // 不显示任何"即将到账"的提示，直接启动2分钟定时器
                            setTimeout(async () => {
                                try {
                                    // ========== 2分钟后：定时器触发 ==========
                                    // 1. 更新UI状态
                                    statusDiv.innerHTML = '✔';
                                    statusDiv.style.color = '#10b981';
                                    taskLink.classList.add('completed');
                                    taskLink.style.background = '#f3f4f6';
                                    taskLink.style.borderColor = '#d1d5db';
                                    taskLink.style.opacity = '0.6';

                                    // 2. 发出"积分更新"全局信号
                                    const updatedUserData = await getUserData(walletAddress);
                                    if (updatedUserData) {
                                        // 更新 localStorage
                                        localStorage.setItem('userData', JSON.stringify(updatedUserData));
                                        
                                        // 通过 eventBus 发送 userDataUpdated 事件
                                        const userDataUpdatedEvent = new CustomEvent('userDataUpdated', {
                                            detail: {
                                                userData: updatedUserData,
                                                timestamp: Date.now()
                                            }
                                        });
                                        document.dispatchEvent(userDataUpdatedEvent);

                                        // 更新用户状态UI（兼容旧代码）
                                        this.updateUserStatusUI(updatedUserData);
                                        
                                        // 重新渲染任务列表以更新状态
                                        this.renderTasks();
                                    }

                                    // 3. 弹出最终的成功提示
                                    this.showToast('任务完成！积分已到账。', 'success');

                                } catch (error) {
                                    console.error('2分钟后刷新用户数据失败:', error);
                                    // 即使刷新失败，也更新UI状态
                                    statusDiv.innerHTML = '✔';
                                    statusDiv.style.color = '#10b981';
                                    taskLink.classList.add('completed');
                                    taskLink.style.background = '#f3f4f6';
                                    taskLink.style.borderColor = '#d1d5db';
                                    taskLink.style.opacity = '0.6';
                                    this.showToast('任务完成！积分已到账。', 'success');
                                }
                            }, 2 * 60 * 1000); // 2分钟后（120,000毫秒）

                            // 保持加载状态，不显示任何提示
                            return;
                        }

                        // 旧逻辑兼容：立即完成的情况（如果后端返回完整用户数据）
                        if (result.wallet_address) {
                            const userData = result;
                            console.log('Task completed immediately:', task.id);

                            // 更新localStorage中的用户数据
                            localStorage.setItem('userData', JSON.stringify(userData));

                            // 发送 userDataUpdated 事件
                            const userDataUpdatedEvent = new CustomEvent('userDataUpdated', {
                                detail: {
                                    userData: userData,
                                    timestamp: Date.now()
                                }
                            });
                            document.dispatchEvent(userDataUpdatedEvent);

                            // 更新用户状态UI
                            this.updateUserStatusUI(userData);

                            // 更新状态图标
                            statusDiv.innerHTML = '✔';
                            statusDiv.style.color = '#10b981';
                            taskLink.classList.add('completed');
                            taskLink.style.background = '#f3f4f6';
                            taskLink.style.borderColor = '#d1d5db';
                            taskLink.style.opacity = '0.6';

                            // 显示成功提示
                            this.showToast('任务完成！', 'success');
                            return;
                        }

                    } catch (error) {
                        console.error('完成任务失败:', error);
                        
                        // ========== 后端返回失败：恢复状态 ==========
                        // 恢复状态
                        statusDiv.textContent = '';
                        taskLink.style.pointerEvents = 'auto';
                        taskLink.style.opacity = '1';
                        
                        // 显示错误提示
                        if (error.message.includes('今日已完成') || error.message.includes('already completed')) {
                            // 如果任务已完成，更新状态
                            statusDiv.innerHTML = '✔';
                            statusDiv.style.color = '#10b981';
                            taskLink.classList.add('completed');
                            taskLink.style.background = '#f3f4f6';
                            taskLink.style.borderColor = '#d1d5db';
                            taskLink.style.opacity = '0.6';
                            taskLink.style.pointerEvents = 'none';
                            this.showToast('该任务今天已经完成过了！', 'info');
                        } else {
                            this.showToast('任务提交失败，请刷新后重试', 'error');
                        }
                    }
                });
            }

            tasksContainer.appendChild(taskLink);
        });

        // 添加旋转动画样式（如果还没有）
        if (!document.getElementById('task-spinner-style')) {
            const style = document.createElement('style');
            style.id = 'task-spinner-style';
            style.textContent = `
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `;
            document.head.appendChild(style);
        }

        console.log('任务列表已渲染，共', tasks.length, '个任务');
    }

    /**
     * 处理完成任务（已废弃，逻辑已移至 renderTasks 中的点击事件监听器）
     * @deprecated 此函数已被废弃，所有逻辑已移至 renderTasks() 中的点击事件监听器
     * @param {HTMLElement} taskLink - 任务链接元素
     * @param {Object} task - 任务配置对象
     */
    async handleCompleteTask(taskLink, task) {
        // 此函数已废弃，保留仅为兼容性
        console.warn('handleCompleteTask 已被废弃，请使用 renderTasks 中的点击事件监听器');
    }

    /**
     * 绑定排行榜相关按钮
     */
    bindLeaderboardButtons() {
        // 绑定 View All 按钮
        const viewAllBtn = document.getElementById('leaderboard-view-all-btn');
        if (viewAllBtn) {
            viewAllBtn.addEventListener('click', () => {
                this.openLeaderboardModal();
            });
        }

        // 页面加载后自动渲染排行榜
        this.renderLeaderboard(1, 10);
    }

    /**
     * 渲染排行榜
     * @param {number} page - 页码
     * @param {number} limit - 每页数量
     */
    async renderLeaderboard(page = 1, limit = 10) {
        try {
            // 根据页码控制标题显示/隐藏（第一页显示，第二页及以后隐藏）
            const header = document.getElementById('leaderboard-header');
            if (header) {
                console.log('[排行榜] 控制标题显示，当前页码:', page);
                if (page === 1) {
                    header.style.setProperty('display', 'flex', 'important');
                    console.log('[排行榜] 显示标题');
                } else {
                    header.style.setProperty('display', 'none', 'important');
                    console.log('[排行榜] 隐藏标题');
                }
            } else {
                console.warn('[排行榜] 未找到 #leaderboard-header 元素');
            }
            
            // 查找列表容器（具有 flex-grow: 1 和 overflow-y: auto 的 div）
            const listContainer = document.getElementById('leaderboard-list-container');
            if (!listContainer) {
                console.warn('Element #leaderboard-list-container not found');
                return;
            }
            
            // 在列表容器内查找 <ul> 元素
            let listElement = listContainer.querySelector('ul');
            if (!listElement) {
                // 如果不存在，创建一个
                listElement = document.createElement('ul');
                listElement.style.cssText = `
                    list-style: none;
                    padding: 0;
                    margin: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    width: 100%;
                    box-sizing: border-box;
                `;
                listContainer.appendChild(listElement);
            }

            // Show loading state
            listElement.innerHTML = '<li style="padding: 20px; text-align: center; color: #718096;">Loading...</li>';

            // 调用后端API获取排行榜数据
            const data = await getLeaderboard(page, limit);

            if (!data || !data.users || !Array.isArray(data.users)) {
                console.error('Leaderboard data format error');
                listElement.innerHTML = '<li style="padding: 20px; text-align: center; color: #ef4444;">Load Failed</li>';
                return;
            }

            // 清空列表元素
            listElement.innerHTML = '';

            if (data.users.length === 0) {
                listElement.innerHTML = '<li style="padding: 20px; text-align: center; color: #718096;">No ranking data</li>';
                return;
            }

            // 计算排名序号（考虑分页）
            const startRank = (page - 1) * limit + 1;

            // 遍历用户列表，创建排名项（按分数从高到低排序）
            // 只显示有积分的用户（points > 0）
            let validUserIndex = 0;
            data.users.forEach((user, index) => {
                // 跳过没有积分的用户
                if (!user.points || user.points <= 0) {
                    return;
                }
                const rank = startRank + validUserIndex;
                validUserIndex++;
                
                // 创建列表项
                const listItem = document.createElement('li');
                listItem.style.cssText = `
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px 16px;
                    background: ${rank <= 3 ? '#fef3c7' : '#f9fafb'};
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    transition: all 0.2s ease;
                `;

                // 排名数字（显示在左侧）
                const rankBadge = document.createElement('span');
                rankBadge.textContent = `#${rank}`;
                rankBadge.style.cssText = `
                    font-size: 16px;
                    font-weight: 700;
                    color: ${rank === 1 ? '#f59e0b' : rank === 2 ? '#6b7280' : rank === 3 ? '#d97706' : '#4a5568'};
                    min-width: 50px;
                    text-align: center;
                    flex-shrink: 0;
                `;

                // 用户信息容器（中间，占据剩余空间）
                const userInfo = document.createElement('div');
                userInfo.style.cssText = `
                    flex: 1;
                    margin-left: 16px;
                    margin-right: 16px;
                    overflow: hidden;
                `;

                const userName = document.createElement('div');
                // Prefer using the random name assigned during user registration
                userName.textContent = user.random_name || user.wallet_address?.substring(0, 8) + '...' || 'Unknown User';
                userName.style.cssText = `
                    font-size: 15px;
                    font-weight: 600;
                    color: #1f2937;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                `;

                userInfo.appendChild(userName);
                listItem.appendChild(rankBadge);
                listItem.appendChild(userInfo);

                // 积分显示（右侧）
                const pointsBadge = document.createElement('span');
                const pointsValue = user.points || 0;
                pointsBadge.textContent = `${pointsValue} ${pointsValue === 1 ? 'point' : 'points'}`;
                pointsBadge.style.cssText = `
                    font-size: 14px;
                    font-weight: 600;
                    color: #3182ce;
                    background: #dbeafe;
                    padding: 6px 12px;
                    border-radius: 12px;
                    white-space: nowrap;
                    flex-shrink: 0;
                `;

                listItem.appendChild(pointsBadge);
                listElement.appendChild(listItem);
            });

            // 创建分页导航
            this.renderLeaderboardPagination(data.total, page, limit);

            console.log('Leaderboard rendered, total', data.users.length, 'users');

        } catch (error) {
            console.error('Failed to render leaderboard:', error);
            const listContainer = document.getElementById('leaderboard-list-container');
            if (listContainer) {
                let listElement = listContainer.querySelector('ul');
                if (!listElement) {
                    listElement = document.createElement('ul');
                    listElement.style.cssText = `
                        list-style: none;
                        padding: 0;
                        margin: 0;
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                        width: 100%;
                        box-sizing: border-box;
                    `;
                    listContainer.appendChild(listElement);
                }
                listElement.innerHTML = '<li style="padding: 20px; text-align: center; color: #ef4444;">Load Failed: ' + error.message + '</li>';
            }
        }
    }

    /**
     * 渲染排行榜分页导航
     * @param {number} total - 总用户数
     * @param {number} currentPage - 当前页码
     * @param {number} limit - 每页数量
     */
    renderLeaderboardPagination(total, currentPage, limit) {
        const totalPages = Math.ceil(total / limit);
        if (totalPages <= 1) {
            // 如果不需要分页，移除可能存在的分页容器
            const existingPagination = document.getElementById('leaderboard-pagination');
            if (existingPagination) {
                existingPagination.remove();
            }
            return; // 不需要分页
        }

        // Find list container
        const listContainer = document.getElementById('leaderboard-list-container');
        if (!listContainer) {
            console.warn('Element #leaderboard-list-container not found, cannot add pagination');
            return;
        }

        // 查找或创建分页容器
        let paginationContainer = document.getElementById('leaderboard-pagination');
        if (!paginationContainer) {
            // 在列表容器内部创建分页容器（在 <ul> 之后）
            paginationContainer = document.createElement('div');
            paginationContainer.id = 'leaderboard-pagination';
            paginationContainer.style.cssText = `
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 12px;
                margin-top: 20px;
                padding-top: 16px;
                padding-bottom: 8px;
                border-top: 1px solid #e2e8f0;
                flex-shrink: 0;
            `;
            // 将分页容器添加到列表容器内部（在 <ul> 之后）
            listContainer.appendChild(paginationContainer);
        }

        // 清空现有内容
        paginationContainer.innerHTML = '';

        // Previous page button
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '← Previous';
        prevBtn.disabled = currentPage === 1;
        prevBtn.style.cssText = `
            padding: 8px 16px;
            background: ${currentPage === 1 ? '#e2e8f0' : '#3182ce'};
            color: ${currentPage === 1 ? '#9ca3af' : 'white'};
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: ${currentPage === 1 ? 'not-allowed' : 'pointer'};
            transition: all 0.2s ease;
        `;
        
        if (currentPage > 1) {
            prevBtn.addEventListener('click', () => {
                this.renderLeaderboard(currentPage - 1, limit);
            });
        }

        // Page info display
        const pageInfo = document.createElement('span');
        pageInfo.textContent = `Page ${currentPage} / ${totalPages}`;
        pageInfo.style.cssText = `
            font-size: 14px;
            color: #4a5568;
            font-weight: 500;
        `;

        // Next page button
        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Next →';
        nextBtn.disabled = currentPage >= totalPages;
        nextBtn.style.cssText = `
            padding: 8px 16px;
            background: ${currentPage >= totalPages ? '#e2e8f0' : '#3182ce'};
            color: ${currentPage >= totalPages ? '#9ca3af' : 'white'};
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: ${currentPage >= totalPages ? 'not-allowed' : 'pointer'};
            transition: all 0.2s ease;
        `;
        
        if (currentPage < totalPages) {
            nextBtn.addEventListener('click', () => {
                this.renderLeaderboard(currentPage + 1, limit);
            });
        }

        paginationContainer.appendChild(prevBtn);
        paginationContainer.appendChild(pageInfo);
        paginationContainer.appendChild(nextBtn);
    }

    /**
     * 打开排行榜全览弹窗
     */
    openLeaderboardModal() {
        // 创建弹窗
        const modal = document.createElement('div');
        modal.id = 'leaderboard-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            border-radius: 16px;
            padding: 24px;
            max-width: 800px;
            max-height: 80vh;
            overflow-y: auto;
            width: 90%;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
        `;

        const modalHeader = document.createElement('div');
        modalHeader.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
            padding-bottom: 16px;
            border-bottom: 2px solid #e2e8f0;
        `;

        const modalTitle = document.createElement('h2');
        modalTitle.textContent = '🏆 Full Leaderboard';
        modalTitle.style.cssText = 'font-size: 24px; font-weight: 700; color: #1f2937; margin: 0;';

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = `
            width: 32px;
            height: 32px;
            background: #ef4444;
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 18px;
            cursor: pointer;
            transition: all 0.2s ease;
        `;
        closeBtn.onclick = () => {
            document.body.removeChild(modal);
        };

        modalHeader.appendChild(modalTitle);
        modalHeader.appendChild(closeBtn);

        const modalListContainer = document.createElement('ul');
        modalListContainer.id = 'leaderboard-modal-list';
        modalListContainer.style.cssText = `
            list-style: none;
            padding: 0;
            margin: 0;
            display: flex;
            flex-direction: column;
            gap: 8px;
        `;

        modalContent.appendChild(modalHeader);
        modalContent.appendChild(modalListContainer);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // 加载前100名数据
        this.renderLeaderboardModal(1, 100, modalListContainer);
    }

    /**
     * 渲染排行榜弹窗内容
     * @param {number} page - 页码
     * @param {number} limit - 每页数量
     * @param {HTMLElement} container - 容器元素
     */
    async renderLeaderboardModal(page = 1, limit = 100, container) {
        try {
            container.innerHTML = '<li style="padding: 20px; text-align: center; color: #718096;">Loading...</li>';

            const data = await getLeaderboard(page, limit);

            if (!data || !data.users || !Array.isArray(data.users)) {
                container.innerHTML = '<li style="padding: 20px; text-align: center; color: #ef4444;">Load Failed</li>';
                return;
            }

            container.innerHTML = '';

            data.users.forEach((user, index) => {
                const rank = index + 1;
                
                const listItem = document.createElement('li');
                listItem.style.cssText = `
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 12px 16px;
                    background: ${rank <= 3 ? '#fef3c7' : '#f9fafb'};
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                `;

                const rankBadge = document.createElement('span');
                rankBadge.textContent = `#${rank}`;
                rankBadge.style.cssText = `
                    font-size: 16px;
                    font-weight: 700;
                    color: ${rank === 1 ? '#f59e0b' : rank === 2 ? '#6b7280' : rank === 3 ? '#d97706' : '#4a5568'};
                    min-width: 50px;
                    text-align: center;
                `;

                const userInfo = document.createElement('div');
                userInfo.style.cssText = 'flex: 1; margin-left: 16px;';

                const userName = document.createElement('div');
                userName.textContent = user.random_name || user.wallet_address?.substring(0, 8) + '...' || 'Unknown User';
                userName.style.cssText = 'font-size: 15px; font-weight: 600; color: #1f2937;';

                userInfo.appendChild(userName);
                listItem.appendChild(rankBadge);
                listItem.appendChild(userInfo);

                const pointsBadge = document.createElement('span');
                pointsBadge.textContent = `${user.points || 0} pts`;
                pointsBadge.style.cssText = `
                    font-size: 14px;
                    font-weight: 600;
                    color: #3182ce;
                    background: #dbeafe;
                    padding: 6px 12px;
                    border-radius: 12px;
                `;

                listItem.appendChild(pointsBadge);
                container.appendChild(listItem);
            });

        } catch (error) {
            console.error('Failed to render leaderboard modal:', error);
            container.innerHTML = '<li style="padding: 20px; text-align: center; color: #ef4444;">Load Failed: ' + error.message + '</li>';
        }
    }

    /**
     * 显示 Toast 提示
     * @param {string} message - 提示消息
     * @param {string} type - 提示类型：'success', 'error', 'info', 'warning'
     */
    showToast(message, type = 'info') {
        // 创建 Toast 容器（如果不存在）
        let toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toast-container';
            toastContainer.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 10px;
            `;
            document.body.appendChild(toastContainer);
        }

        // 创建 Toast 元素
        const toast = document.createElement('div');
        const colors = {
            success: { bg: '#10b981', text: '#ffffff' },
            error: { bg: '#ef4444', text: '#ffffff' },
            info: { bg: '#3182ce', text: '#ffffff' },
            warning: { bg: '#f59e0b', text: '#ffffff' }
        };
        const color = colors[type] || colors.info;
        
        toast.style.cssText = `
            padding: 12px 20px;
            background: ${color.bg};
            color: ${color.text};
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            font-size: 14px;
            font-weight: 500;
            min-width: 250px;
            max-width: 400px;
            animation: slideIn 0.3s ease-out;
        `;
        toast.textContent = message;

        // 添加动画样式（如果不存在）
        if (!document.getElementById('toast-animations')) {
            const style = document.createElement('style');
            style.id = 'toast-animations';
            style.textContent = `
                @keyframes slideIn {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                @keyframes slideOut {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        toastContainer.appendChild(toast);

        // 3秒后自动移除
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }

    /**
     * 更新用户状态UI
     * @param {Object} userData - 用户数据对象
     */
    updateUserStatusUI(userData) {
        if (!userData) {
            console.warn('用户数据为空，无法更新状态UI');
            return;
        }

        // 更新白名单状态显示
        const whitelistDisplay = document.getElementById('whitelist-status-display');
        if (whitelistDisplay) {
            if (userData.is_whitelisted) {
                whitelistDisplay.textContent = '尊贵的白名单成员';
                whitelistDisplay.style.color = '#fbbf24'; // 金色
            } else {
                whitelistDisplay.textContent = '暂未获得';
                whitelistDisplay.style.color = '#9ca3af'; // 灰色
            }
        }

        // 更新游戏额度显示
        const allowanceDisplay = document.getElementById('play-allowance-display');
        if (allowanceDisplay) {
            const playAllowance = userData.play_allowance_sol || 1;
            const remaining = Math.max(0, playAllowance - consumedAllowance).toFixed(4);
            allowanceDisplay.textContent = `游戏额度：${remaining} / ${playAllowance} SOL`;
            
            // 如果额度不足，显示警告颜色
            if (consumedAllowance >= playAllowance) {
                allowanceDisplay.style.color = '#ef4444'; // 红色
            } else if (consumedAllowance >= playAllowance * 0.8) {
                allowanceDisplay.style.color = '#f59e0b'; // 橙色
            } else {
                allowanceDisplay.style.color = '#10b981'; // 绿色
            }
        }

        // 更新积分显示
        const pointsDisplay = document.getElementById('user-points-display');
        if (pointsDisplay) {
            const points = userData.points || 0;
            pointsDisplay.textContent = points.toString();
        }

        // 更新开始游戏按钮状态（如果存在）
        this.updatePlayGameButtonState(userData);
    }

    /**
     * 绑定用户数据更新事件监听器
     * 当收到 userDataUpdated 事件时，自动更新所有积分显示
     */
    bindUserDataUpdateEvents() {
        document.addEventListener('userDataUpdated', (event) => {
            const userData = event.detail?.userData;
            if (userData) {
                console.log('收到 userDataUpdated 事件，更新用户状态UI:', userData);
                // 更新用户状态UI（包括积分显示）
                this.updateUserStatusUI(userData);
                // 重新渲染任务列表以更新状态
                this.renderTasks();
            }
        });
        console.log('userDataUpdated 事件监听器已绑定');
    }

    /**
     * 更新开始游戏按钮状态
     * @param {Object} userData - 用户数据对象
     */
    updatePlayGameButtonState(userData) {
        const playButtons = document.querySelectorAll('.lottery-button[data-action="lottery-trigger"]');
        const playGameBtn = document.getElementById('play-game-btn');
        
        const buttonsToUpdate = playGameBtn ? [playGameBtn, ...playButtons] : playButtons;

        buttonsToUpdate.forEach(button => {
            if (!button) return;

            // 检查预售模式
            if (presaleOnlyMode && (!userData || !userData.is_whitelisted)) {
                button.disabled = true;
                button.textContent = '预售进行中，仅限白名单用户参与';
                button.style.opacity = '0.6';
                button.style.cursor = 'not-allowed';
                return;
            }

            // 检查游戏额度
            const playPrice = parseFloat(window.PLAY_PRICE || '0.001');
            const playAllowance = userData?.play_allowance_sol || 1;
            const newConsumedAmount = consumedAllowance + playPrice;

            if (newConsumedAmount > playAllowance) {
                button.disabled = true;
                button.textContent = '游戏额度已用完';
                button.style.opacity = '0.6';
                button.style.cursor = 'not-allowed';
            } else {
                button.disabled = false;
                if (button.dataset.originalText) {
                    button.textContent = button.dataset.originalText;
                }
                button.style.opacity = '1';
                button.style.cursor = 'pointer';
            }
        });
    }

    /**
     * 从链上读取游戏配置（包括预售模式）
     */
    async loadGameConfig() {
        if (!IS_GAME_PROGRAM_CONFIGURED) {
            console.warn('Game Program ID 未配置，跳过读取游戏配置。');
            return;
        }

        if (!gameProgram || !connection) {
            console.warn('游戏程序或连接未初始化，无法读取配置');
            return;
        }

        try {
            // TODO: 从链上读取 GameConfig 账户
            // 这里需要根据实际的 Solana 程序结构来实现
            // const gameConfigPubkey = deriveGameConfigPDA();
            // const gameConfigAccount = await connection.getAccountInfo(gameConfigPubkey);
            // const configData = parseGameConfigAccount(gameConfigAccount.data);
            // presaleOnlyMode = configData.presale_only_mode;

            console.log('游戏配置加载完成，预售模式:', presaleOnlyMode);

            // 更新游戏按钮状态
            const userData = getCurrentUserData();
            if (userData) {
                this.updatePlayGameButtonState(userData);
            }

        } catch (error) {
            console.error('加载游戏配置失败:', error);
        }
    }
}

/**
 * 调整画布高度，确保绝对定位组件不会被裁剪
 */
// ============ 全局初始化 ============
let solanaDAppRuntime = null;

/**
 * 页面加载完成后自动初始化
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('页面加载完成，开始初始化Solana DApp...');
    
    // 创建运行时引擎实例
    solanaDAppRuntime = new SolanaDAppRuntime();
    
    // 初始化运行时引擎
    await solanaDAppRuntime.init();
    
    console.log('Solana DApp初始化完成');
});

// 极简高度补偿，避免画布坍塌并应用布局顺序
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('canvas');
    if (!canvas || canvas.children.length === 0) {
        return;
    }

    document.body.style.overflowY = 'auto';

    const breakpoints = {
        base: { minColumnWidth: 280 },
        md: { minColumnWidth: 340 },
        lg: { minColumnWidth: 400 }
    };

    function applyResponsiveColumns() {
        const width = window.innerWidth;
        let minColumnWidth = breakpoints.base.minColumnWidth;
        if (width >= 1024) {
            minColumnWidth = breakpoints.lg.minColumnWidth;
        } else if (width >= 768) {
            minColumnWidth = breakpoints.md.minColumnWidth;
        }

        const availableColumns = Math.max(1, Math.floor(canvas.clientWidth / minColumnWidth));
        const maxColumnsAttr = Number.parseInt(canvas.getAttribute('data-max-columns'), 10);
        const maxColumns = Number.isFinite(maxColumnsAttr) ? Math.max(1, maxColumnsAttr) : availableColumns;
        const columns = Math.max(1, Math.min(availableColumns, maxColumns));
        canvas.style.gridTemplateColumns = 'repeat(' + columns + ', minmax(' + minColumnWidth + 'px, 1fr))';
        canvas.style.gridAutoFlow = 'row';

        canvas.querySelectorAll('.resize-drag').forEach(element => {
            const orderAttr = element.getAttribute('data-layout-order');
            if (Number.isFinite(parseInt(orderAttr, 10))) {
                element.style.order = String(parseInt(orderAttr, 10));
            }

            const spanAttr = element.getAttribute('data-layout-span');
            let span = Number.parseInt(spanAttr, 10);
            if (!Number.isFinite(span) || span < 1) {
                span = 1;
            }
            span = Math.min(span, columns);
            element.style.gridColumn = 'span ' + span + ' / span ' + span;

            const rowSpanAttr = element.getAttribute('data-layout-row-span');
            let rowSpan = Number.parseInt(rowSpanAttr, 10);
            if (!Number.isFinite(rowSpan) || rowSpan < 1) {
                rowSpan = 1;
            }
            element.style.gridRow = 'span ' + rowSpan + ' / span ' + rowSpan;

            element.style.minWidth = '0';

            const componentType = element.getAttribute('data-component-type');
            if (componentType === 'text' || componentType === 'paragraph' || componentType === 'header') {
                element.style.height = 'auto';
            }
        });
    }

    applyResponsiveColumns();
    window.addEventListener('resize', applyResponsiveColumns);
});

/**
 * 导出运行时引擎实例（供其他脚本使用）
 */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SolanaDAppRuntime, solanaDAppRuntime };
}
