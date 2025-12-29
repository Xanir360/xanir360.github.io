
// ==========================================
// 🛡️ شبیه‌ساز هوشمند فایربیس (نسخه نهایی و ضد خطا)
// ==========================================

// جلوگیری از خطای ReferenceError برای کدهای قدیمی
var firebaseConfig = {}; 

const firebase = {
    apps: { length: 1 },
    initializeApp: function() { return this; },
    
    database: function() {
        const PROXY_URL = "https://xanir360.byethost9.com/api.php";
        
        const createSnapshot = (data) => ({
            val: () => data || null,
            key: null,
            exists: () => data !== null,
            forEach: (fn) => {
                if (data) Object.entries(data).forEach(([k, v]) => fn({ val: () => v, key: k }));
            }
        });

        return {
            ref: (path) => ({
                once: async (type, callback) => {
                    try {
                        const res = await fetch(`${PROXY_URL}?path=${path}`);
                        if (!res.ok) throw new Error("Server Error");
                        const data = await res.json();
                        const snap = createSnapshot(data);
                        if (callback) callback(snap);
                        return snap;
                    } catch (e) {
                        console.warn(`⚠️ خطا در دریافت مسیر ${path}:`, e.message);
                        const emptySnap = createSnapshot(null);
                        if (callback) callback(emptySnap);
                        return emptySnap; // برگرداندن اسنپ‌شات خالی برای جلوگیری از کرش
                    }
                },
                on: function(type, callback) { this.once(type, callback); },
                off: () => {},
                push: async (data) => {
                    const res = await fetch(`${PROXY_URL}?path=${path}`, { 
                        method: 'POST', 
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(data) 
                    });
                    const resData = await res.json();
                    return { key: resData.name || '', val: () => data };
                },
                set: (data) => fetch(`${PROXY_URL}?path=${path}`, { method: 'PUT', body: JSON.stringify(data) }),
                update: (data) => fetch(`${PROXY_URL}?path=${path}`, { method: 'PATCH', body: JSON.stringify(data) }),
                remove: () => fetch(`${PROXY_URL}?path=${path}`, { method: 'DELETE' })
            })
        };
    },
    
    auth: () => ({ 
        onAuthStateChanged: (cb) => {
            // شبیه‌سازی وضعیت ورود (می‌توانید اطلاعات ادمین خود را اینجا بگذارید)
            setTimeout(() => cb({ uid: "admin_123", email: "admin@xanir.com", displayName: "ادمین" }), 100);
        },
        signOut: () => Promise.resolve()
    })
};

// متغیرهای سراسری برای استفاده در تمام فایل‌ها (admin.js, comment.js و غیره)
window.db = firebase.database();
const database = window.db;
// Initialize Firebase
//firebase.initializeApp(firebaseConfig);

// متغیرهای جهانی
let isSignUpMode = false;
let currentCommentId = null;
let currentPostId = null;
let loadingStartTime = null;
let loadingInterval = null;
let commentEventListenersAdded = false;

// ================ سیستم لودینگ متحرک ================

/**
 * نمایش لودینگ متحرک
 */
function showLoading(message = "در حال بارگذاری محتوا") {
    const loadingElement = document.getElementById('globalLoading');
    const messageElement = document.getElementById('loadingMessage');
    const progressBar = document.getElementById('progressBar');
    
    if (loadingElement && messageElement) {
        // تنظیم پیام
        messageElement.textContent = message;
        
        // نمایش لودینگ
        loadingElement.style.display = 'flex';
        loadingElement.classList.remove('fade-out');
        
        // ریست کردن نوار پیشرفت
        if (progressBar) {
            progressBar.style.width = '0%';
            setTimeout(() => {
                progressBar.style.width = '100%';
            }, 100);
        }
        
        // شروع تایمر
        loadingStartTime = Date.now();
        updateLoadingTime();
        loadingInterval = setInterval(updateLoadingTime, 1000);
    }
}

/**
 * بروزرسانی زمان لودینگ
 */
function updateLoadingTime() {
    if (!loadingStartTime) return;
    
    const timeElement = document.getElementById('loadingTime');
    if (timeElement) {
        const seconds = Math.floor((Date.now() - loadingStartTime) / 1000);
        timeElement.textContent = convertToPersianNumbers(seconds) + " ثانیه";
    }
}

/**
 * مخفی کردن لودینگ
 */
function hideLoading() {
    const loadingElement = document.getElementById('globalLoading');
    if (loadingElement) {
        // توقف تایمر
        if (loadingInterval) {
            clearInterval(loadingInterval);
            loadingInterval = null;
        }
        
        // افکت fade-out
        loadingElement.classList.add('fade-out');
        
        // حذف از DOM بعد از انیمیشن
        setTimeout(() => {
            loadingElement.style.display = 'none';
        }, 500);
    }
}

/**
 * نمایش لودینگ کوچک برای عملیات سریع
 */
function showSmallLoading(message = "در حال پردازش") {
    // ایجاد لودینگ کوچک اگر وجود ندارد
    let smallLoader = document.getElementById('smallLoading');
    if (!smallLoader) {
        smallLoader = document.createElement('div');
        smallLoader.id = 'smallLoading';
        smallLoader.className = 'small-loading';
        smallLoader.innerHTML = `
            <div class="small-spinner"></div>
            <span>${message}</span>
        `;
        document.body.appendChild(smallLoader);
    } else {
        smallLoader.querySelector('span').textContent = message;
        smallLoader.style.display = 'flex';
    }
}

/**
 * مخفی کردن لودینگ کوچک
 */
function hideSmallLoading() {
    const smallLoader = document.getElementById('smallLoading');
    if (smallLoader) {
        smallLoader.style.display = 'none';
    }
}

/**
 * تابع بهبود یافته نمایش پست با لودینگ
 */
async function displayPost() {
    // نمایش لودینگ فقط برای بارگذاری اولیه
    if (!document.body.classList.contains('content-loaded')) {
        showLoading("در حال بارگذاری پست و نظرات");
    }
    
    try {
        const postId = getPostIdFromURL();
        if (!postId) {
            throw new Error("شناسه پست پیدا نشد.");
        }

        // تاخیر مصنوعی برای نمایش لودینگ (حداقل 4 ثانیه فقط برای بار اول)
        const minimumLoadingTime = document.body.classList.contains('content-loaded') ? 0 : 4000;
        const startTime = Date.now();

        const post = await fetchPost(postId);
        renderPost(post);

        const user = firebase.auth().currentUser;
        const userData = user ? await fetchUser(user.uid) : null;

        renderComments(post, postId, user, userData);
        
        // محاسبه زمان باقیمانده تا 4 ثانیه
        const elapsedTime = Date.now() - startTime;
        const remainingTime = Math.max(minimumLoadingTime - elapsedTime, 0);
        
        // صبر کردن برای تکمیل 4 ثانیه
        if (remainingTime > 0) {
            await new Promise(resolve => setTimeout(resolve, remainingTime));
        }
        
        // علامت گذاری که محتوا لود شده
        document.body.classList.add('content-loaded');
        
    } catch (error) {
        console.error('Error displaying post:', error);
        document.getElementById('error').innerText = error.message;
        
        // تغییر پیام خطا در لودینگ
        const messageElement = document.getElementById('loadingMessage');
        if (messageElement) {
            messageElement.textContent = "خطا در بارگذاری محتوا";
            messageElement.style.color = "#e74c3c";
        }
        
        // تاخیر قبل از مخفی کردن لودینگ
        await new Promise(resolve => setTimeout(resolve, 2000));
    } finally {
        // مخفی کردن لودینگ
        hideLoading();
    }
}

// ================ سیستم احراز هویت ================

// نمایش یا مخفی کردن باکس ورود/ثبت‌نام
document.getElementById('auth-toggle').addEventListener('click', () => {
    const authBox = document.getElementById('auth-box');
    authBox.style.display = authBox.style.display === 'block' ? 'none' : 'block';
});

// تغییر حالت بین ورود و ثبت‌نام
function toggleAuthMode() {
    isSignUpMode = !isSignUpMode;
    document.getElementById('username').style.display = isSignUpMode ? 'block' : 'none';
    document.getElementById('profileImage').style.display = isSignUpMode ? 'block' : 'none';
    document.getElementById('authButton').textContent = isSignUpMode ? 'ثبت‌نام' : 'ورود';
    document.getElementById('toggleAuthButton').textContent = isSignUpMode ? 'ورود' : 'ثبت‌نام';
    document.getElementById('error').innerText = '';
}

// مدیریت فرم احراز هویت
document.getElementById('authForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;

    try {
        showSmallLoading(isSignUpMode ? "در حال ثبت‌نام" : "در حال ورود");

        if (isSignUpMode) {
            const username = document.getElementById('username').value;
            const profileImageInput = document.getElementById('profileImage').value;
            const profileImage = profileImageInput.trim() || 'https://eramblog.com/img/1713345118_3177999.jpg';

            const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            await firebase.database().ref('users/' + user.uid).set({
                username: username,
                email: email,
                profileImage: profileImage,
                role: "user"
            });

            showMessage("ثبت‌نام موفقیت‌آمیز بود!", 'success');
        } else {
            await firebase.auth().signInWithEmailAndPassword(email, password);
            showMessage("ورود موفقیت‌آمیز بود!", 'success');
        }

        const user = firebase.auth().currentUser;
        const userData = await fetchUser(user.uid);
        showUserInfo(userData);
        document.getElementById('auth-box').style.display = 'none';
    } catch (error) {
        handleError(error);
    } finally {
        hideSmallLoading();
    }
});

// نمایش اطلاعات کاربر در هدر
function showUserInfo(userData) {
    document.getElementById('auth-menu').style.display = 'none';
    document.getElementById('user-profile-menu').style.display = 'block';
    document.getElementById('user-profile-image').src = userData.profileImage;
    document.getElementById('user-profile-name').textContent = userData.username;

    // اضافه کردن event listener برای منوی کاربر
    const userProfile = document.getElementById('user-profile');
    const logoutOption = document.getElementById('logout-option');
    
    if (userProfile && logoutOption) {
        userProfile.addEventListener('click', (e) => {
            e.stopPropagation();
            logoutOption.style.display = logoutOption.style.display === 'block' ? 'none' : 'block';
        });

        document.addEventListener('click', (e) => {
            if (logoutOption.style.display === 'block' && !userProfile.contains(e.target)) {
                logoutOption.style.display = 'none';
            }
        });
    }
}

// مدیریت کلیک روی تنظیمات
document.getElementById('settingsButton').addEventListener('click', () => {
    const settingsBox = document.getElementById('settings-box');
    if (settingsBox) {
        settingsBox.style.display = 'block';
    }
});

// بستن باکس تنظیمات
function closeSettings() {
    const settingsBox = document.getElementById('settings-box');
    if (settingsBox) {
        settingsBox.style.display = 'none';
    }
}

// پیش‌نمایش عکس پروفایل
document.getElementById('newProfileImage').addEventListener('input', (e) => {
    const profileImagePreview = document.getElementById('profileImagePreview');
    const imageUrl = e.target.value;

    if (profileImagePreview) {
        if (imageUrl) {
            profileImagePreview.src = imageUrl;
            profileImagePreview.style.display = 'block';
        } else {
            profileImagePreview.style.display = 'none';
        }
    }
});

// مدیریت فرم تنظیمات
document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const user = firebase.auth().currentUser;
    if (!user) {
        showMessage('لطفاً ابتدا وارد شوید.', 'error');
        return;
    }

    const newUsername = document.getElementById('newUsername').value;
    const newPassword = document.getElementById('newPassword').value;
    const newProfileImage = document.getElementById('newProfileImage').value;

    try {
        showSmallLoading("در حال ذخیره تغییرات");

        const updates = {};
        if (newUsername) updates['username'] = newUsername;
        if (newProfileImage) updates['profileImage'] = newProfileImage;

        await firebase.database().ref('users/' + user.uid).update(updates);

        if (newPassword) {
            await user.updatePassword(newPassword);
        }

        showMessage('تغییرات با موفقیت ذخیره شد!', 'success');
        document.getElementById('settings-box').style.display = 'none';
        
        // تاخیر قبل از ریلود
        setTimeout(() => {
            location.reload();
        }, 1000);
        
    } catch (error) {
        handleError(error);
    } finally {
        hideSmallLoading();
    }
});

// خروج کاربر
document.getElementById('logoutButton').addEventListener('click', () => {
    showSmallLoading("در حال خروج");
    
    firebase.auth().signOut().then(() => {
        showMessage("خروج موفقیت‌آمیز بود!", 'success');
        document.getElementById('user-profile-menu').style.display = 'none';
        document.getElementById('auth-menu').style.display = 'block';
        hideSmallLoading();
    }).catch((error) => {
        handleError(error);
        hideSmallLoading();
    });
});

// دریافت اطلاعات کاربر از Realtime Database
async function fetchUser(userId) {
    const userRef = firebase.database().ref('users/' + userId);
    const snapshot = await userRef.once('value');
    return snapshot.val();
}

// نمایش پیام
function showMessage(message, type) {
    const alertBox = document.createElement('div');
    alertBox.className = `alert alert-${type} fixed-top w-50 mx-auto mt-3 text-center`;
    alertBox.innerText = message;
    document.body.appendChild(alertBox);

    setTimeout(() => {
        if (alertBox.parentElement) {
            alertBox.remove();
        }
    }, 3000);
}

// مدیریت خطاها
function handleError(error) {
    let errorMessage;
    switch (error.code) {
        case 'auth/weak-password':
            errorMessage = 'رمز عبور باید حداقل ۶ کاراکتر باشد.';
            break;
        case 'auth/requires-recent-login':
            errorMessage = 'لطفاً دوباره وارد شوید تا تغییرات اعمال شود.';
            break;
        default:
            errorMessage = 'خطایی رخ داده است. لطفاً دوباره تلاش کنید.';
    }
    showMessage(errorMessage, 'error');
}

/**
 * تبدیل اعداد انگلیسی به فارسی
 * @param {string} text - متن حاوی اعداد
 * @returns {string} متن با اعداد فارسی
 */
function convertToPersianNumbers(text) {
    if (!text) return text;
    
    const persianNumbers = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return text.toString().replace(/\d/g, (match) => persianNumbers[match]);
}

// ================ سیستم مدیریت پست و تبلیغات ================

async function fetchPost(postId) {
    const postRef = firebase.database().ref('posts/' + postId);
    const snapshot = await postRef.once('value');
    const post = snapshot.val();

    if (!post) {
        throw new Error("پست پیدا نشد.");
    }

    return post;
}

// تابع بهبود یافته نمایش پست
function renderPost(post) {
    const postDiv = document.getElementById('postDiv');
    if (!postDiv) return;

    // پاک کردن محتوای قبلی
    postDiv.innerHTML = '';

    // پردازش محتوای پست برای تبلیغات
    const processContentWithAds = (content) => {
        if (!content) return '';
        
        // جایگزینی shortcodeهای تبلیغاتی
        return content.replace(/adsshow:\{([^}]+)\}/g, (match, adId) => {
            return `<div class="ad-placeholder" data-ad-id="${adId}">
                [تبلیغ: ${adId}]
            </div>`;
        });
    };

    const processedContent = processContentWithAds(post.content);
    
    postDiv.innerHTML = createPostHTML(post.title, processedContent, convertToJalali(post.date), post.imageUrl);

    // پردازش تگ‌ها
    const tagsDiv = document.getElementById('tags');
    if (tagsDiv) {
        tagsDiv.innerHTML = ''; // پاک کردن تگ‌های قبلی
        
        if (post.tags) {
            const tagsArray = Array.isArray(post.tags) 
                ? post.tags 
                : String(post.tags).split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
            
            tagsArray.forEach(tag => {
                const tagSpan = document.createElement('span');
                tagSpan.className = 'tag-badge';
                tagSpan.textContent = tag;
                tagsDiv.appendChild(tagSpan);
            });
        }
    }

    // لود کردن تبلیغات واقعی پس از نمایش پست
    loadActualAds();
}

// تابع برای لود کردن تبلیغات واقعی
async function loadActualAds() {
    const adPlaceholders = document.querySelectorAll('.ad-placeholder');
    
    for (const placeholder of adPlaceholders) {
        const adId = placeholder.getAttribute('data-ad-id');
        try {
            const adSnapshot = await firebase.database().ref('ads/' + adId).once('value');
            const ad = adSnapshot.val();
            
            if (ad && isAdActive(ad)) {
                placeholder.innerHTML = generateAdHTML(ad);
            } else {
                placeholder.remove(); // حذف اگر تبلیغ موجود نیست یا منقضی شده
            }
        } catch (error) {
            console.error('Error loading ad:', error);
            placeholder.remove();
        }
    }
}

// بررسی فعال بودن تبلیغ
function isAdActive(ad) {
    if (!ad.startDate || !ad.endDate) return false;
    
    const now = new Date();
    const startDate = new Date(ad.startDate);
    const endDate = new Date(ad.endDate);
    return now >= startDate && now <= endDate;
}

// تولید HTML تبلیغ بر اساس نوع
function generateAdHTML(ad) {
    if (!ad) return '[تبلیغ نامعتبر]';
    
    switch (ad.kind) {
        case 'banner':
            return `<div class="ad-banner">
                <a href="${ad.linkUrl || '#'}" target="_blank">
                    <img src="${ad.imageUrl}" alt="${ad.title || 'تبلیغ'}" 
                         style="width: ${ad.width || 728}px; height: ${ad.height || 90}px;">
                </a>
            </div>`;
        
        case 'text':
            return `<div class="ad-text ${ad.layout || 'inline'}">
                ${ad.thumbnailUrl ? `<img src="${ad.thumbnailUrl}" alt="${ad.title || 'تبلیغ'}" class="ad-thumbnail">` : ''}
                <div class="ad-content">${ad.content || ''}</div>
                <a href="${ad.linkUrl || '#'}" target="_blank" class="ad-link">مشاهده بیشتر</a>
            </div>`;
        
        case 'popup':
            return `<div class="ad-popup-preview">
                <h4>${ad.title || 'تبلیغ'}</h4>
                <div>${ad.content || ''}</div>
            </div>`;
        
        default:
            return `[تبلیغ: ${ad.title || 'نامشخص'}]`;
    }
}

function createPostHTML(title, content, date, imageUrl) {
    return `
        <div class="post">
            <div class="header">
                <h2>${title || 'بدون عنوان'}</h2>
                <small>${date || 'بدون تاریخ'}</small>
            </div>
            ${imageUrl ? `<img src="${imageUrl}" alt="${title || 'پست'}" class="imageUrl-center">` : ''}
            <p>${content || 'بدون محتوا'}</p>
        </div>
    `;
}

// ================ سیستم مدیریت نظرات ================

/**
 * تابع نمایش نظرات با طراحی بهتر و قابلیت‌های جدید
 */
function renderComments(post, postId, user, userData) {
    const commentsDiv = document.getElementById('comments');
    if (!commentsDiv) return;

    commentsDiv.innerHTML = '';

    if (post.comments) {
        const sortedComments = Object.entries(post.comments).sort((a, b) => {
            return new Date(b[1].date) - new Date(a[1].date);
        });

        sortedComments.forEach(([commentId, comment]) => {
            if (!comment) return;
            
            if (!comment.approved && (!userData || userData.role !== "admin")) {
                return;
            }

            const commentDiv = document.createElement('div');
            commentDiv.className = `comment-card ${!comment.approved ? 'pending' : ''}`;
            commentDiv.innerHTML = `
                <div class="comment-header">
                    <img src="${comment.profileImage || 'https://i.imgur.com/8Km9tLL.jpg'}" 
                         class="comment-avatar" alt="${comment.user || 'کاربر'}"
                         onerror="this.src='https://i.imgur.com/8Km9tLL.jpg'">
                    <div>
                        <h4 class="comment-username">${comment.user || 'کاربر'}</h4>
                        <span class="comment-date">${convertToJalali(comment.date)}</span>
                        ${comment.approvedAt ? `<span class="comment-approved-date">تأیید شده در ${convertToJalali(comment.approvedAt)}</span>` : ''}
                        ${!comment.approved ? '<span class="comment-status badge bg-warning">در انتظار تأیید</span>' : ''}
                    </div>
                </div>
                <div class="comment-body">
                    <p>${sanitizeInput(comment.text || '')}</p>
                    ${comment.rejectionReason ? `<div class="rejection-reason"><strong>دلیل رد:</strong> ${sanitizeInput(comment.rejectionReason)}</div>` : ''}
                </div>
                <div class="comment-actions">
                    ${user ? `<button class="btn-reply" data-comment-id="${commentId}">پاسخ دادن</button>` : ''}
                    ${user && user.uid === comment.userId ? `<button class="btn-edit-comment" data-comment-id="${commentId}" data-comment-text="${sanitizeInput(comment.text || '')}">ویرایش</button>` : ''}
                    
                    ${userData && userData.role === "admin" ? `
                        ${!comment.approved ? `
                            <button class="btn-approve" data-comment-id="${commentId}">تأیید نظر</button>
                        ` : `
                            <button class="btn-reject" data-comment-id="${commentId}">رد نظر</button>
                        `}
                        <button class="btn-delete" data-comment-id="${commentId}">حذف</button>
                    ` : ''}
                </div>
                <div class="reply-form" id="reply-form-${commentId}" style="display:none">
                    <textarea class="reply-input" id="reply-text-${commentId}" placeholder="پاسخ خود را بنویسید..." rows="3"></textarea>
                    <button class="btn-submit-reply" data-comment-id="${commentId}">ارسال پاسخ</button>
                </div>
                ${comment.replies ? renderReplies(comment.replies, postId, commentId, userData) : ''}
            `;
            commentsDiv.appendChild(commentDiv);
        });
    } else {
        commentsDiv.innerHTML = `
            <div class="no-comments text-center py-4">
                <i class="fas fa-comments fa-3x text-muted mb-3"></i>
                <p class="text-muted">هنوز نظری ثبت نشده است.</p>
                <p class="text-muted small">اولین نفری باشید که نظر می‌دهد!</p>
            </div>
        `;
    }

    // اضافه کردن event listeners فقط یک بار
    if (!commentEventListenersAdded) {
        setupCommentEventListeners();
        commentEventListenersAdded = true;
    }
}
/**
 * راه‌اندازی event listeners برای فرم نظر
 */
function setupCommentForm() {
    console.log('🔧 راه‌اندازی فرم نظرات...');
    
    // دکمه ارسال نظر
    const submitBtn = document.getElementById('submitComment');
    if (submitBtn) {
        submitBtn.addEventListener('click', submitComment);
        console.log('✅ دکمه ارسال نظر متصل شد');
    } else {
        console.error('❌ دکمه ارسال نظر پیدا نشد!');
        // ایجاد دکمه به صورت پویا اگر وجود ندارد
        createSubmitButton();
    }

    // فیلد متن نظر
    const commentText = document.getElementById('commentText');
    if (commentText) {
        // ارسال با Ctrl+Enter
        commentText.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                submitComment();
            }
        });

        // شمارش کاراکتر
        commentText.addEventListener('input', (e) => {
            updateCharacterCount(e.target.value.length);
        });
        
        console.log('✅ فیلد متن نظر متصل شد');
    }

    // ایجاد شمارنده کاراکتر
    createCharacterCounter();
}

/**
 * ایجاد شمارنده کاراکتر
 */
function createCharacterCounter() {
    const commentText = document.getElementById('commentText');
    const commentForm = document.getElementById('commentForm');
    
    if (!commentText || !commentForm) return;

    let counter = document.getElementById('characterCounter');
    if (!counter) {
        counter = document.createElement('div');
        counter.id = 'characterCounter';
        counter.className = 'character-counter text-muted small mt-1';
        counter.style.fontSize = '0.8rem';
        commentForm.appendChild(counter);
    }
    updateCharacterCount(commentText.value.length);
}

/**
 * بروزرسانی شمارنده کاراکتر
 */
function updateCharacterCount(length) {
    const counter = document.getElementById('characterCounter');
    if (counter) {
        counter.textContent = `${length} کاراکتر`;
        counter.style.color = length < 3 ? '#dc3545' : length > 500 ? '#ffc107' : '#6c757d';
    }
}
// =======================================================================
// تابع جدید: راه‌اندازی Listener برای دکمه ارسال نظر اصلی
// =======================================================================
function setupMainCommentForm() {
    const submitBtn = document.getElementById('submitComment');
    
    if (submitBtn) {
        // برای جلوگیری از تکرار Listenerها، دکمه را کلون می‌کنیم و جایگزین می‌کنیم.
        const oldBtn = submitBtn;
        const newBtn = oldBtn.cloneNode(true);
        oldBtn.parentNode.replaceChild(newBtn, oldBtn);
        
        // اتصال Listener کلیک
        newBtn.addEventListener('click', (e) => {
            e.preventDefault(); 
            submitComment();
        });
        
        // اتصال Ctrl+Enter در textarea اصلی
        const commentText = document.getElementById('commentText');
        if (commentText) {
             // مطمئن می‌شویم لیسنر قبلی (اگر بود) حذف شود
             const oldCommentText = commentText;
             const newCommentText = oldCommentText.cloneNode(true);
             oldCommentText.parentNode.replaceChild(newCommentText, oldCommentText);
             
             newCommentText.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                    e.preventDefault();
                    submitComment();
                }
             });
        }
        console.log('✅ دکمه ارسال نظر اصلی با موفقیت راه‌اندازی شد.');
    }
}
// =======================================================================
// تابع اصلاح شده: راه‌اندازی event listeners برای نظرات (مدیریت پاسخ‌ها)
// =======================================================================
function setupCommentEventListeners() {
    console.log('Setting up comment event listeners...');
    
    // مدیریت event delegation برای دکمه‌های نظرات
    document.addEventListener('click', async (e) => {
        const postId = getPostIdFromURL();
        const user = firebase.auth().currentUser;
        
        // اگر کاربر لاگین نیست، اجازه اجرای عملیات‌هایی که نیاز به userData دارند را نده
        if (!user && !e.target.classList.contains('btn-reply')) return; 

        let userData = null;
        if (user) {
             // فقط اگر یک دکمه مدیریتی یا ارسال پاسخ کلیک شد، userData را دریافت کن
             if (e.target.classList.contains('btn-approve') || 
                 e.target.classList.contains('btn-reject') || 
                 e.target.classList.contains('btn-delete') ||
                 e.target.classList.contains('btn-edit-comment') ||
                 e.target.classList.contains('btn-submit-reply') ||
                 e.target.classList.contains('btn-approve-reply') ||
                 e.target.classList.contains('btn-reject-reply') ||
                 e.target.classList.contains('btn-delete-reply') ||
                 e.target.classList.contains('btn-edit-reply')) {
                 userData = await fetchUser(user.uid);
             }
        }
        // اگر عملیات نیاز به کاربر لاگین شده و ادمین بودن دارد، اینجا چک می‌شود
        if (!user) return; 

        try {
            // پاسخ به نظر (باز و بسته کردن فرم)
            if (e.target.classList.contains('btn-reply')) {
                e.preventDefault();
                await handleReplyClick(e);
            }
            
            // ارسال پاسخ
            else if (e.target.classList.contains('btn-submit-reply')) {
                e.preventDefault();
                await handleSubmitReply(e, postId, user, userData);
            }
            
            // --- دکمه‌های مدیریت کامنت اصلی ---
            else if (e.target.classList.contains('btn-approve')) {
                await handleApproveComment(e, postId);
            }
            else if (e.target.classList.contains('btn-reject')) {
                await handleRejectComment(e, postId);
            }
            else if (e.target.classList.contains('btn-delete')) {
                await handleDeleteComment(e, postId);
            }
            else if (e.target.classList.contains('btn-edit-comment')) {
                // ✅ ویرایش کامنت اصلی
                await handleEditCommentClick(e, postId);
            }
            
            // --- دکمه‌های مدیریت پاسخ‌ها (Replies) ---
            else if (e.target.classList.contains('btn-approve-reply')) {
                // ✅ تابع جدید: تایید پاسخ توسط ادمین
                await handleApproveReply(e, postId);
            }
            else if (e.target.classList.contains('btn-reject-reply')) {
                 // ❗ نیاز به تعریف تابع handleRejectReply
                 await handleRejectReply(e, postId); 
            }
            else if (e.target.classList.contains('btn-delete-reply')) {
                // ❗ نیاز به تعریف تابع handleDeleteReply
                await handleDeleteReply(e, postId);
            }
            else if (e.target.classList.contains('btn-edit-reply')) {
                 // ❗ نیاز به تعریف تابع handleEditReplyClick
                 await handleEditReplyClick(e, postId);
            }

        } catch (error) {
            console.error('Error in comment action:', error);
            showMessage("خطا در انجام درخواست: " + error.message, 'error');
        }
    });

    // مدیریت کلید میانبر (Ctrl+Enter) روی input پاسخ
    // ... (این بخش بدون تغییر است)
    document.addEventListener('keydown', async (e) => {
        if (e.ctrlKey && e.key === 'Enter') {
            const activeElement = document.activeElement;
            if (activeElement && activeElement.classList.contains('reply-input')) {
                e.preventDefault();
                const commentId = activeElement.id.replace('reply-text-', '');
                const submitBtn = document.querySelector(`.btn-submit-reply[data-comment-id="${commentId}"]`);
                
                if (submitBtn) {
                     submitBtn.click();
                }
            }
        }
    });
}
// =======================================================================
// تابع جدید: تایید پاسخ (Reply) توسط ادمین
// =======================================================================
async function handleApproveReply(e, postId) {
    const commentId = e.target.dataset.commentId;
    const replyId = e.target.dataset.replyId;

    if (!commentId || !replyId) {
        showMessage("خطا: اطلاعات نظر یا پاسخ گم شده است.", 'error');
        return;
    }

    try {
        const user = firebase.auth().currentUser;
        if (!user) throw new Error("لطفاً وارد شوید.");

        showSmallLoading("در حال تأیید پاسخ...");
        
        // به‌روزرسانی وضعیت پاسخ به approved
        await firebase.database().ref(`posts/${postId}/comments/${commentId}/replies/${replyId}`).update({
            status: 'approved',
            approvedAt: new Date().toISOString(),
            approvedBy: user.uid
        });

        showMessage("پاسخ با موفقیت تأیید شد.", 'success');
        await refreshComments(postId);

    } catch (error) {
        console.error('Error approving reply:', error);
        showMessage("خطا در تأیید پاسخ: " + error.message, 'error');
    } finally {
        hideSmallLoading();
    }
}
// سایر توابع مانند handleReplyClick و renderReplies که در زیر آمده، 
// نیاز به تغییر اساسی ندارند اما برای اطمینان از صحت، آنها را نیز جایگزین کنید.
// -------------------------------------------------------------------

// تابع handleReplyClick (باز و بسته کردن فرم پاسخ)
async function handleReplyClick(e) { 
    const commentId = e.target.dataset.commentId;
    const replyForm = document.getElementById(`reply-form-${commentId}`);
    if (replyForm) {
        // Toggle display
        replyForm.style.display = replyForm.style.display === 'block' ? 'none' : 'block';
        
        // Focus on the input if showing
        if (replyForm.style.display === 'block') {
            replyForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const replyInput = document.getElementById(`reply-text-${commentId}`);
            if (replyInput) replyInput.focus();
        }
    }
}

// =======================================================================
// تابع اصلاح شده: نمایش HTML پاسخ‌ها (با فیلتر وضعیت و امنیت)
// =======================================================================
function renderReplies(replies, postId, commentId, userData) {
    if (!replies) return '';

    let repliesHTML = '<div class="replies-list">';
    
    // تبدیل آبجکت به آرایه و مرتب سازی بر اساس تاریخ
    const sortedReplies = Object.entries(replies).sort((a, b) => {
        return new Date(a[1].date) - new Date(b[1].date); 
    });
    
    const isAdmin = userData && userData.role === "admin";
    const currentUserId = userData ? userData.uid : null;

    sortedReplies.forEach(([replyId, reply]) => {
        if (!reply) return;
        
        // ❌ فیلتر حیاتی: پاسخ فقط باید در دو حالت نمایش داده شود: 
        // 1. اگر وضعیت approved باشد. 
        // 2. اگر کاربر فعلی ادمین باشد (برای مدیریت).
        if (reply.status !== 'approved' && !isAdmin) {
            // اگر کاربر، پاسخ خود را ارسال کرده ولی تأیید نشده، نمایش نمی‌دهیم تا کاربر فکر نکند عمومی شده.
            return;
        }
        
        // نشانگر وضعیت برای ادمین
        let statusBadge = '';
        if (isAdmin && reply.status !== 'approved') {
            statusBadge = `<span class="badge bg-warning text-dark me-2">در انتظار</span>`;
        }

        repliesHTML += `
            <div class="reply-card">
                <div class="reply-header">
                    <img src="${reply.profileImage || 'https://i.imgur.com/8Km9tLL.jpg'}" class="reply-avatar" alt="${reply.user || 'کاربر'}" onerror="this.src='https://i.imgur.com/8Km9tLL.jpg'">
                    <div>
                        <h5 class="reply-username">${reply.user || 'کاربر'}</h5>
                        <span class="reply-date">${convertToJalali(reply.date)}</span>
                        ${statusBadge}
                    </div>
                </div>
                <div class="reply-body">
                    <p>${sanitizeInput(reply.text || '')}</p>
                </div>
                ${(userData && (isAdmin || currentUserId === reply.userId)) ? `
                    <div class="reply-actions">
                        ${isAdmin && reply.status !== 'approved' ? `<button class="btn btn-sm btn-approve-reply" data-comment-id="${commentId}" data-reply-id="${replyId}">تأیید</button>` : ''}
                        <button class="btn btn-sm btn-delete-reply" data-comment-id="${commentId}" data-reply-id="${replyId}">حذف</button>
                        ${currentUserId === reply.userId ? `
                            <button class="btn btn-sm btn-edit-reply" data-comment-id="${commentId}" data-reply-id="${replyId}" data-reply-text="${sanitizeInput(reply.text || '')}">ویرایش</button>
                        ` : ''}
                    </div>
                ` : ''}
            </div> 
        `;
    });
    return repliesHTML + '</div>';
}

// توابع جداگانه برای هر action
async function handleReplyClick(e) {
    const commentId = e.target.dataset.commentId;
    const replyForm = document.getElementById(`reply-form-${commentId}`);
    if (replyForm) {
        replyForm.style.display = replyForm.style.display === 'block' ? 'none' : 'block';
        if (replyForm.style.display === 'block') {
            replyForm.scrollIntoView({ behavior: 'smooth' });
            const replyInput = document.getElementById(`reply-text-${commentId}`);
            if (replyInput) replyInput.focus();
        }
    }
}

// =======================================================================
// تابع نهایی و اصلاح شده: ارسال پاسخ (رفع مشکل دو بار ارسال و تأیید ادمین)
// =======================================================================
async function handleSubmitReply(e, postId, user, userData) {
    // 1. جلوگیری از ارسال تکراری (Debouncing)
    if (e.target.hasAttribute('data-processing')) {
        return;
    }
    
    // 2. بررسی احراز هویت
    if (!user || !userData) {
        showMessage("لطفاً ابتدا وارد شوید.", 'error');
        return;
    }
    
    const commentId = e.target.dataset.commentId;
    const replyInput = document.getElementById(`reply-text-${commentId}`);
    const replyText = replyInput ? replyInput.value.trim() : '';
    
    if (!replyText) {
        showMessage("لطفاً متن پاسخ را وارد کنید.", 'error');
        return;
    }
    
    e.target.setAttribute('data-processing', 'true');
    e.target.disabled = true;
    
    try {
        showSmallLoading("در حال ارسال پاسخ");
        
        const isAdmin = userData.role === "admin";
        
        const reply = {
            user: userData.username,
            userId: user.uid,
            text: sanitizeInput(replyText),
            date: new Date().toISOString(),
            // ✅ اصلاح حیاتی: اگر ادمین باشد approved، در غیر این صورت pending
            status: isAdmin ? 'approved' : 'pending', 
            profileImage: userData.profileImage || 'https://i.imgur.com/8Km9tLL.jpg'
        };
        
        // اضافه کردن فیلدهای تأیید اگر کاربر ادمین است
        if (isAdmin) {
            reply.approvedAt = new Date().toISOString();
            reply.approvedBy = user.uid;
        }

        // 3. دستور ارسال به دیتابیس (فقط یک بار)
        await firebase.database().ref(`posts/${postId}/comments/${commentId}/replies`).push(reply);

        if (isAdmin) {
             showMessage("پاسخ شما بلافاصله نمایش داده شد.", 'success');
        } else {
             showMessage("پاسخ شما با موفقیت ثبت شد و پس از تأیید نمایش داده خواهد شد.", 'success');
        }
        
        if (replyInput) replyInput.value = '';
        
        // بستن فرم پاسخ پس از ارسال
        const replyForm = document.getElementById(`reply-form-${commentId}`);
        if(replyForm) {
            replyForm.style.display = 'none';
        }

        await refreshComments(postId);
        
    } catch (error) {
        console.error("خطا در ثبت پاسخ:", error);
        showMessage("خطا در ثبت پاسخ: " + error.message, 'error');
    } finally {
        e.target.removeAttribute('data-processing');
        e.target.disabled = false;
        hideSmallLoading();
    }
}

// تابع رفرش سریع نظرات
async function refreshComments(postId) {
    try {
        const post = await fetchPost(postId);
        const user = firebase.auth().currentUser;
        const userData = user ? await fetchUser(user.uid) : null;
        renderComments(post, postId, user, userData);
    } catch (error) {
        console.error('Error refreshing comments:', error);
    }
}

// توابع مشابه برای سایر actions...
async function handleApproveComment(e, postId) {
    const commentId = e.target.dataset.commentId;
    await approveComment(postId, commentId);
}

async function handleRejectComment(e, postId) {
    const commentId = e.target.dataset.commentId;
    await rejectComment(postId, commentId);
}

async function handleDeleteComment(e, postId) {
    const commentId = e.target.dataset.commentId;
    await deleteComment(postId, commentId);
}

// =======================================================================
// تابع جدید: باز کردن مودال ویرایش نظر برای ادمین
// =======================================================================
async function handleEditCommentClick(e, postId) {
    e.preventDefault();
    const commentId = e.target.dataset.commentId;
    const commentText = e.target.dataset.commentText; // متن فعلی از دیتاست دکمه

    if (!commentId || !commentText) {
        showMessage("خطا: اطلاعات نظر برای ویرایش یافت نشد.", 'error');
        return;
    }
    
    // فرض می‌کنیم شما یک مودال با ID='editCommentModal' و یک textarea با ID='editCommentText' دارید.
    const modalElement = document.getElementById('editCommentModal');
    const textareaElement = document.getElementById('editCommentText');
    const saveButton = document.getElementById('saveCommentEdit');

    if (textareaElement) {
        textareaElement.value = commentText;
    }
    
    // ذخیره ID نظر و ID پست در دکمه ذخیره مودال
    if (saveButton) {
        saveButton.dataset.commentId = commentId;
        saveButton.dataset.postId = postId;
        
        // اطمینان از حذف Listenerهای قدیمی برای جلوگیری از تکرار
        const oldSaveBtn = saveButton;
        const newSaveBtn = oldSaveBtn.cloneNode(true);
        oldSaveBtn.parentNode.replaceChild(newSaveBtn, oldSaveBtn);
        
        // اتصال Listener جدید
        newSaveBtn.addEventListener('click', () => {
             handleSaveCommentEdit(newSaveBtn.dataset.postId, newSaveBtn.dataset.commentId);
        });
    }

    if (modalElement) {
        const editModal = new bootstrap.Modal(modalElement);
        editModal.show();
    } else {
        showMessage("خطا: مودال ویرایش پیدا نشد. لطفاً ساختار HTML را بررسی کنید.", 'error');
    }
}
// =======================================================================
// تابع جدید: ذخیره ویرایش نظر توسط ادمین و به‌روزرسانی دیتابیس
// =======================================================================
async function handleSaveCommentEdit(postId, commentId) {
    const textareaElement = document.getElementById('editCommentText');
    const saveButton = document.getElementById('saveCommentEdit');
    
    const newText = textareaElement ? textareaElement.value.trim() : '';

    if (!newText) {
        showMessage("متن نظر نمی‌تواند خالی باشد.", 'error');
        return;
    }

    if (!postId || !commentId) {
        showMessage("خطا: اطلاعات ضروری پست یا نظر گم شده است.", 'error');
        return;
    }
    
    // جلوگیری از کلیک‌های تکراری
    if (saveButton.hasAttribute('data-processing')) return;
    saveButton.setAttribute('data-processing', 'true');
    saveButton.disabled = true;

    try {
        const user = firebase.auth().currentUser;
        if (!user) throw new Error("کاربر احراز هویت نشده است.");

        showSmallLoading("در حال به‌روزرسانی نظر...");
        
        // به‌روزرسانی مستقیم متن در دیتابیس
        await firebase.database().ref(`posts/${postId}/comments/${commentId}`).update({
            text: sanitizeInput(newText), // استفاده از تابع امنیتی شما
            editedAt: new Date().toISOString(),
            editedBy: user.uid
        });

        // بستن مودال
        const modalElement = document.getElementById('editCommentModal');
        if (modalElement) {
            const editModal = bootstrap.Modal.getInstance(modalElement);
            if (editModal) editModal.hide();
        }

        showMessage("نظر با موفقیت ویرایش و ذخیره شد.", 'success');
        
        // رفرش کردن کامنت‌ها برای نمایش تغییرات
        await refreshComments(postId);

    } catch (error) {
        console.error('Error saving comment edit:', error);
        showMessage("خطا در ذخیره ویرایش: " + error.message, 'error');
    } finally {
        saveButton.removeAttribute('data-processing');
        saveButton.disabled = false;
        hideSmallLoading();
    }
}
async function handleDeleteReply(e, postId) {
    const commentId = e.target.dataset.commentId;
    const replyId = e.target.dataset.replyId;
    await deleteReply(postId, commentId, replyId);
}

async function handleEditReply(e, postId) {
    const commentId = e.target.dataset.commentId;
    const replyId = e.target.dataset.replyId;
    const replyText = e.target.dataset.replyText;
    openEditModal('reply', postId, commentId, replyText, replyId);
}

/**
 * تابع نمایش پاسخ‌ها با طراحی بهتر
 */
function renderReplies(replies, postId, commentId, userData) {
    let repliesHTML = '<div class="replies-container">';
    
    // مرتب سازی پاسخ‌ها بر اساس تاریخ (جدیدترین اول)
    const sortedReplies = Object.entries(replies).sort((a, b) => {
        return new Date(b[1].date) - new Date(a[1].date);
    });

    sortedReplies.forEach(([replyId, reply]) => {
        if (!reply) return;
        
        repliesHTML += `
            <div class="reply-card">
                <div class="reply-header">
                    <img src="${reply.profileImage || 'https://i.imgur.com/8Km9tLL.jpg'}" 
                         class="reply-avatar" alt="${reply.user || 'کاربر'}"
                         onerror="this.src='https://i.imgur.com/8Km9tLL.jpg'">
                    <div>
                        <h5 class="reply-username">${reply.user || 'کاربر'}</h5>
                        <span class="reply-date">${convertToJalali(reply.date)}</span>
                    </div>
                </div>
                <div class="reply-body">
                    <p>${sanitizeInput(reply.text || '')}</p>
                </div>
                ${(userData && (userData.role === "admin" || userData.uid === reply.userId)) ? `
                    <div class="reply-actions">
                        <button class="btn btn-sm btn-delete-reply" 
                                data-comment-id="${commentId}" 
                                data-reply-id="${replyId}">حذف</button>
                        ${userData.uid === reply.userId ? `
                            <button class="btn btn-sm btn-edit-reply" 
                                    data-comment-id="${commentId}" 
                                    data-reply-id="${replyId}"
                                    data-reply-text="${sanitizeInput(reply.text || '')}">ویرایش</button>
                        ` : ''}
                    </div>
                ` : ''}
            </div>
        `;
    });
    return repliesHTML + '</div>';
}

// ================ توابع جدید مدیریت نظرات ================

/**
 * تأیید نظر توسط ادمین
 */
async function approveComment(postId, commentId) {
    try {
        showSmallLoading("در حال تأیید نظر");
        
        const user = firebase.auth().currentUser;
        await firebase.database().ref(`posts/${postId}/comments/${commentId}`).update({
            approved: true,
            approvedAt: new Date().toISOString(),
            approvedBy: user.uid,
            rejectionReason: null
        });
        showMessage("نظر با موفقیت تأیید شد.", 'success');
        await refreshComments(postId);
    } catch (error) {
        showMessage("خطا در تأیید نظر: " + error.message, 'error');
    } finally {
        hideSmallLoading();
    }
}

/**
 * رد نظر توسط ادمین
 */
async function rejectComment(postId, commentId) {
    try {
        // بررسی وجود Swal
        if (typeof Swal === 'undefined') {
            throw new Error('کتابخانه SweetAlert2 بارگذاری نشده است');
        }

        const { value: reason } = await Swal.fire({
            title: 'دلیل رد نظر',
            input: 'textarea',
            inputPlaceholder: 'دلیل رد این نظر را وارد کنید...',
            inputValidator: (value) => {
                if (!value) {
                    return 'لطفاً دلیل رد نظر را وارد کنید';
                }
            },
            showCancelButton: true,
            confirmButtonText: 'تأیید رد',
            cancelButtonText: 'انصراف',
            customClass: {
                validationMessage: 'text-danger'
            }
        });

        if (reason) {
            showSmallLoading("در حال رد نظر");
            
            const user = firebase.auth().currentUser;
            await firebase.database().ref(`posts/${postId}/comments/${commentId}`).update({
                approved: false,
                rejectedAt: new Date().toISOString(),
                rejectedBy: user.uid,
                rejectionReason: reason
            });
            showMessage("نظر با موفقیت رد شد.", 'success');
            await refreshComments(postId);
        }
    } catch (error) {
        console.error('خطا در رد نظر:', error);
        showMessage(error.message, 'error');
    } finally {
        hideSmallLoading();
    }
}

/**
 * حذف نظر
 */
async function deleteComment(postId, commentId) {
    try {
        // بررسی وجود Swal
        if (typeof Swal === 'undefined') {
            const confirmed = confirm('آیا مطمئن هستید که می‌خواهید این نظر را حذف کنید؟');
            if (!confirmed) return;
            
            showSmallLoading("در حال حذف نظر");
            await firebase.database().ref(`posts/${postId}/comments/${commentId}`).remove();
            showMessage("نظر با موفقیت حذف شد.", 'success');
            await refreshComments(postId);
            return;
        }

        const { isConfirmed } = await Swal.fire({
            title: 'حذف نظر',
            text: 'آیا مطمئن هستید که می‌خواهید این نظر را حذف کنید؟',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'بله، حذف کن',
            cancelButtonText: 'انصراف'
        });

        if (isConfirmed) {
            showSmallLoading("در حال حذف نظر");
            await firebase.database().ref(`posts/${postId}/comments/${commentId}`).remove();
            showMessage("نظر با موفقیت حذف شد.", 'success');
            await refreshComments(postId);
        }
    } catch (error) {
        console.error('خطا در حذف نظر:', error);
        showMessage("خطا در حذف نظر: " + error.message, 'error');
    } finally {
        hideSmallLoading();
    }
}

/**
 * حذف پاسخ
 */
async function deleteReply(postId, commentId, replyId) {
    try {
        // بررسی وجود Swal
        if (typeof Swal === 'undefined') {
            const confirmed = confirm('آیا مطمئن هستید که می‌خواهید این پاسخ را حذف کنید؟');
            if (!confirmed) return;
            
            showSmallLoading("در حال حذف پاسخ");
            await firebase.database().ref(`posts/${postId}/comments/${commentId}/replies/${replyId}`).remove();
            showMessage("پاسخ با موفقیت حذف شد.", 'success');
            await refreshComments(postId);
            return;
        }

        const { isConfirmed } = await Swal.fire({
            title: 'حذف پاسخ',
            text: 'آیا مطمئن هستید که می‌خواهید این پاسخ را حذف کنید؟',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'بله، حذف کن',
            cancelButtonText: 'انصراف'
        });

        if (isConfirmed) {
            showSmallLoading("در حال حذف پاسخ");
            await firebase.database().ref(`posts/${postId}/comments/${commentId}/replies/${replyId}`).remove();
            showMessage("پاسخ با موفقیت حذف شد.", 'success');
            await refreshComments(postId);
        }
    } catch (error) {
        console.error('خطا در حذف پاسخ:', error);
        showMessage("خطا در حذف پاسخ: " + error.message, 'error');
    } finally {
        hideSmallLoading();
    }
}

/**
 * باز کردن مودال ویرایش نظر/پاسخ
 */
function openEditModal(type, postId, commentId, text, replyId = null) {
    const modalElement = document.getElementById('editModal');
    if (!modalElement) return;
    
    const modal = new bootstrap.Modal(modalElement);
    const modalLabel = document.getElementById('editModalLabel');
    const editText = document.getElementById('edit-text');
    const saveBtn = document.getElementById('edit-save-btn');
    
    if (modalLabel) modalLabel.textContent = `ویرایش ${type === 'comment' ? 'نظر' : 'پاسخ'}`;
    if (editText) editText.value = text || '';
    
    if (saveBtn) {
        // حذف event listenerهای قبلی
        saveBtn.replaceWith(saveBtn.cloneNode(true));
        const newSaveBtn = document.getElementById('edit-save-btn');
        
        newSaveBtn.onclick = async () => {
            const newText = editText ? editText.value.trim() : '';
            if (!newText) {
                showMessage("لطفاً متن را وارد کنید.", 'error');
                return;
            }

            try {
                showSmallLoading("در حال ذخیره تغییرات");
                
                if (type === 'comment') {
                    await firebase.database().ref(`posts/${postId}/comments/${commentId}`).update({
                        text: sanitizeInput(newText),
                        editedAt: new Date().toISOString()
                    });
                } else {
                    await firebase.database().ref(`posts/${postId}/comments/${commentId}/replies/${replyId}`).update({
                        text: sanitizeInput(newText),
                        editedAt: new Date().toISOString()
                    });
                }
                modal.hide();
                showMessage("ویرایش با موفقیت انجام شد.", 'success');
                await refreshComments(postId);
            } catch (error) {
                showMessage("خطا در ویرایش: " + error.message, 'error');
            } finally {
                hideSmallLoading();
            }
        };
    }
    modal.show();
}

// =======================================================================
// تابع اصلاح شده: ارسال نظر اصلی (رفع مشکل دو بار ارسال و تأیید ادمین)
// =======================================================================
async function submitComment() {
    const submitBtn = document.getElementById('submitComment');
    
    // 1. بررسی و جلوگیری از ارسال تکراری (Debouncing)
    if (!submitBtn || submitBtn.hasAttribute('data-processing')) {
        return;
    }

    try {
        submitBtn.setAttribute('data-processing', 'true');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> در حال ارسال...';
        
        showSmallLoading("در حال ارسال نظر");
        
        const postId = getPostIdFromURL(); 
        const commentTextElement = document.getElementById('commentText');
        const commentText = commentTextElement ? commentTextElement.value.trim() : '';

        if (!commentText) {
            throw new Error("لطفاً نظر خود را بنویسید.");
        }

        const user = firebase.auth().currentUser;
        if (!user) {
            throw new Error("لطفاً وارد شوید تا بتوانید نظر بدهید.");
        }

        const userData = await fetchUser(user.uid);
        const isAdmin = userData.role === "admin";

        // ساخت آبجکت نظر
        const comment = {
            user: userData.username,
            userId: user.uid,
            text: sanitizeInput(commentText),
            date: new Date().toISOString(),
            // منطق تأیید: ادمین = approved، کاربر عادی = pending
            approved: isAdmin,
            status: isAdmin ? 'approved' : 'pending',
            profileImage: userData.profileImage || 'https://i.imgur.com/8Km9tLL.jpg'
        };

        // اضافه کردن فیلدهای تأیید اگر کاربر ادمین است
        if (isAdmin) {
            comment.approvedAt = new Date().toISOString();
            comment.approvedBy = user.uid;
        }

        // ✅ دستور ارسال به دیتابیس (فقط یک بار)
        await firebase.database().ref('posts/' + postId + '/comments').push(comment);

        if (commentTextElement) {
            commentTextElement.value = '';
        }
        
        if (isAdmin) {
            showMessage("نظر شما بلافاصله نمایش داده شد.", 'success');
        } else {
            showMessage("نظر شما با موفقیت ثبت شد و پس از تأیید نمایش داده خواهد شد.", 'success');
        }

        await refreshComments(postId);
        
    } catch (error) {
        console.error('Error submitting comment:', error);
        showMessage("خطا در ثبت نظر: " + error.message, 'error');
    } finally {
        submitBtn.removeAttribute('data-processing');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane me-2"></i> ارسال نظر';
        hideSmallLoading();
    }
}

/**
 * پاکسازی ورودی کاربر با استفاده از DOMPurify برای جلوگیری از XSS
 * @param {string} input - متن ورودی کاربر
 * @returns {string} - متن پاکسازی شده
 */
function sanitizeInput(input) {
    if (typeof DOMPurify === 'undefined') {
        // Fallback ایمن در صورت عدم بارگذاری DOMPurify
        console.warn("DOMPurify not loaded. Using basic text sanitization.");
        return input.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    
    // ✅ DOMPurify: اجازه هیچ تگ HTMLی را نمی‌دهد.
    return DOMPurify.sanitize(input, {ALLOWED_TAGS: []}); 
}
// تبدیل تاریخ میلادی به جلالی
function convertToJalali(gregorianDate) {
    if (!gregorianDate) return "بدون تاریخ";
    
    const date = moment(new Date(gregorianDate).toISOString());
    if (!date.isValid()) {
        return "تاریخ نامعتبر";
    }
    const jalaliDate = date.locale('fa').format('jYYYY/jMM/jDD HH:mm');
    return convertToPersianNumbers(jalaliDate);
}

// دریافت شناسه پست از URL
function getPostIdFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

// ================ CSS اضافه برای بخش نظرات و لودینگ ================
const commentStyles = `
<style>
    /* استایل‌های پایه */
    .comments-section {
        margin-top: 2rem;
        padding: 1.5rem;
        background-color: #f9f9f9;
        border-radius: 8px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    
    .comments-title {
        font-size: 1.5rem;
        margin-bottom: 1.5rem;
        color: #333;
        border-bottom: 1px solid #eee;
        padding-bottom: 0.5rem;
    }
    
    .no-comments {
        text-align: center;
        color: #666;
        padding: 1rem;
    }
    
    /* استایل کارت نظرات */
    .comment-card {
        background: #fff;
        border-radius: 8px;
        padding: 1.25rem;
        margin-bottom: 1.25rem;
        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        transition: all 0.3s ease;
    }
    
    .comment-card:hover {
        box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }
    
    .comment-card.pending {
        background: #fff8e1;
        border-left: 4px solid #ffc107;
    }
    
    /* هدر نظرات */
    .comment-header {
        display: flex;
        align-items: center;
        margin-bottom: 0.75rem;
    }
    
    .comment-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        margin-left: 12px;
        object-fit: cover;
    }
    
    .comment-username {
        margin: 0;
        font-size: 1rem;
        color: #333;
    }
    
    .comment-date, .comment-approved-date {
        font-size: 0.75rem;
        color: #666;
        display: block;
    }
    
    .comment-status {
        font-size: 0.7rem;
        margin-right: 8px;
    }
    
    /* بدنه نظرات */
    .comment-body {
        margin-bottom: 0.75rem;
        line-height: 1.6;
    }
    
    .comment-body p {
        margin-bottom: 0.5rem;
    }
    
    .rejection-reason {
        background-color: #ffeeee;
        padding: 0.5rem;
        border-radius: 4px;
        font-size: 0.8rem;
        color: #d32f2f;
        margin-top: 0.5rem;
    }
    
    /* دکمه‌های اقدامات */
    .comment-actions {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
    }
   
    /* استایل‌های دکمه‌ها */
    .comment-actions button,
    .reply-actions button {
        padding: 0.25rem 0.5rem;
        font-size: 0.8rem;
        border-radius: 4px;
        border: none;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .btn-reply {
        background-color: #e3f2fd;
        color: #1976d2;
    }
    
    .btn-reply:hover {
        background-color: #bbdefb;
    }
    
    .btn-approve {
        background-color: #e8f5e9;
        color: #388e3c;
    }
    
    .btn-approve:hover {
        background-color: #c8e6c9;
    }
    
    .btn-reject {
        background-color: #ffebee;
        color: #d32f2f;
    }
    
    .btn-reject:hover {
        background-color: #ffcdd2;
    }
    
    .btn-delete, .btn-delete-reply {
        background-color: #fbe9e7;
        color: #e64a19;
    }
    
    .btn-delete:hover, .btn-delete-reply:hover {
        background-color: #ffccbc;
    }
    
    .btn-edit-comment, .btn-edit-reply {
        background-color: #fff3e0;
        color: #f57c00;
    }
    
    .btn-edit-comment:hover, .btn-edit-reply:hover {
        background-color: #ffe0b2;
    }
    
    .btn-submit-reply {
        background-color: #1976d2;
        color: white;
    }
    
    .btn-submit-reply:hover {
        background-color: #1565c0;
    }
    /* فرم پاسخ */
    .reply-form {
        margin-top: 1rem;
        padding: 1rem;
        background: #f5f5f5;
        border-radius: 6px;
        display: none;
    }
    
    .reply-input {
        width: 100%;
        padding: 0.5rem;
        border: 1px solid #ddd;
        border-radius: 4px;
        margin-bottom: 0.5rem;
        resize: vertical;
    }
    
    /* پاسخ‌ها */
    .replies-container {
        margin-top: 1rem;
        padding-right: 1rem;
        border-right: 2px solid #eee;
    }

    /* جهت متن برای پشتیبانی از اعداد فارسی */
    .comment-body, .reply-body, .comment-date, .reply-date {
        direction: rtl;
        text-align: right;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    
    /* برای اطمینان از نمایش صحیح اعداد */
    .persian-number {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        unicode-bidi: plaintext;
    }
	
    .reply-card {
        background: #fafafa;
        border-radius: 6px;
        padding: 0.75rem;
        margin-bottom: 0.75rem;
    }
    
    .reply-header {
        display: flex;
        align-items: center;
        margin-bottom: 0.5rem;
    }
    
    .reply-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        margin-left: 8px;
        object-fit: cover;
    }
    
    .reply-username {
        margin: 0;
        font-size: 0.9rem;
        color: #444;
    }
    
    .reply-date {
        font-size: 0.7rem;
        color: #777;
    }
    
    .reply-actions {
        margin-top: 0.5rem;
        display: flex;
        gap: 0.5rem;
    }
    
    /* مودال ویرایش */
    .edit-modal textarea {
        min-height: 120px;
    }

    /* استایل‌های تبلیغات */
    .ad-placeholder {
        border: 1px dashed #ccc;
        padding: 10px;
        margin: 10px 0;
        text-align: center;
        background: #f9f9f9;
    }

    .ad-banner {
        margin: 15px 0;
        text-align: center;
    }

    .ad-banner img {
        max-width: 100%;
        height: auto;
        border-radius: 5px;
    }

    .ad-text {
        border: 1px solid #e0e0e0;
        padding: 15px;
        margin: 15px 0;
        border-radius: 5px;
        background: #f8f9fa;
    }

    .ad-text.inline {
        display: inline-block;
    }

    .ad-text .ad-thumbnail {
        max-width: 100px;
        float: right;
        margin-left: 10px;
    }

    .ad-popup-preview {
        cursor: pointer;
        border: 1px solid #007bff;
        padding: 10px;
        border-radius: 5px;
        background: #e3f2fd;
    }

    .tag-badge {
        background: #007bff;
        color: white;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 0.8em;
        margin: 2px;
        display: inline-block;
    }

    /* لودینگ کوچک */
    .small-loading {
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(255, 255, 255, 0.95);
        padding: 10px 15px;
        border-radius: 20px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        display: none;
        align-items: center;
        gap: 10px;
        backdrop-filter: blur(10px);
        border: 1px solid #e0e0e0;
    }

    .small-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid #f3f3f3;
        border-top: 2px solid #667eea;
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    .small-loading span {
        font-size: 0.85rem;
        color: #333;
        font-family: 'Vazir', Tahoma, sans-serif;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
</style>
`;

// اضافه کردن استایل‌ها به صفحه
document.head.insertAdjacentHTML('beforeend', commentStyles);

// ================ HTML مودال ویرایش ================
const editModalHTML = `
<div class="modal fade" id="editModal" tabindex="-1" aria-labelledby="editModalLabel" aria-hidden="true">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="editModalLabel">ویرایش نظر</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
                <textarea id="edit-text" class="form-control" rows="5"></textarea>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">انصراف</button>
                <button type="button" class="btn btn-primary" id="edit-save-btn">ذخیره تغییرات</button>
            </div>
        </div>
    </div>
</div>
`;

// اضافه کردن مودال ویرایش به صفحه
document.body.insertAdjacentHTML('beforeend', editModalHTML);

// ================ مقداردهی اولیه ================
window.onload = function() {
    console.log('Page loaded, initializing with loading...');
    
    // نمایش لودینگ اولیه
    showLoading("آماده‌سازی سیستم");
    
    // مقداردهی اولیه Firebase
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }

    // مدیریت وضعیت کاربر با تاخیر
    setTimeout(() => {
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    const userData = await fetchUser(user.uid);
                    showUserInfo(userData);
                } catch (error) {
                    console.error('Error fetching user data:', error);
                }
            } else {
                const userProfileMenu = document.getElementById('user-profile-menu');
                const authMenu = document.getElementById('auth-menu');
                if (userProfileMenu) userProfileMenu.style.display = 'none';
                if (authMenu) authMenu.style.display = 'block';
            }
            
            // نمایش پست پس از تأیید وضعیت کاربر
            displayPost();
			
			setupMainCommentForm();
			
			
        });
    }, 1000);

    // جلوگیری از ارسال فرم با Enter در textarea
    const commentText = document.getElementById('commentText');
    if (commentText) {
        commentText.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                submitComment();
            }
        });
    }
};
