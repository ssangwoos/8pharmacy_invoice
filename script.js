/* script.js - Firebase 연동 최종 완성본 */

// =========================================
// 1. Firebase 설정 및 초기화 (반드시 본인 키로 변경!)
// =========================================
const firebaseConfig = {
  apiKey: "AIzaSyBcMCqu39hwSw1Osm8Kd4GS5KMTG6BEgYA",
  authDomain: "pharmacy-ledger-fbca7.firebaseapp.com",
  projectId: "pharmacy-ledger-fbca7",
  storageBucket: "pharmacy-ledger-fbca7.firebasestorage.app",
  messagingSenderId: "243652172908",
  appId: "1:243652172908:web:a801ea5d71cdfec01fcc49"
};

// Firebase 초기화 (중복 방지)
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
} else {
    firebase.app(); // 이미 있으면 기존 것 사용
}

const db = firebase.firestore();
const storage = firebase.storage();

// 전역 변수
let pendingList = [];
let ledgerData = [];
let currentSelectedId = null;
let currentScale = 1;

// 컬렉션 이름 설정
const COL_PENDING = "pending_uploads"; // 대기열
const COL_LEDGER = "transactions";     // 장부


// =========================================
// 2. 초기화 및 실시간 리스너 연결
// =========================================
document.addEventListener('DOMContentLoaded', function() {
    
    // 날짜 입력칸 오늘 날짜로
    const dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach(input => {
        if(!input.value) input.valueAsDate = new Date();
    });

    // --- [실시간] 대기열 감시 (index.html, write.html) ---
    // 데이터베이스에 변화가 생기면 즉시 실행됨
    db.collection(COL_PENDING).orderBy("createdAt", "desc").onSnapshot((snapshot) => {
        pendingList = [];
        snapshot.forEach((doc) => {
            pendingList.push({ id: doc.id, ...doc.data() });
        });

        // 화면 갱신
        if(document.getElementById('queueList')) renderQueueList();
        updateDashboardCount(); // index.html 배지 갱신
    });

    // --- [실시간] 장부 감시 (ledger.html) ---
    // ledger.html에 있을 때만 리스너 동작
    if(document.getElementById('ledgerTableBody')) {
        db.collection(COL_LEDGER).orderBy("date", "asc").onSnapshot((snapshot) => {
            ledgerData = [];
            snapshot.forEach((doc) => {
                // Firestore Timestamp를 날짜 문자열로 변환 등의 처리 가능하지만
                // 여기선 저장할 때 string으로 저장하므로 그대로 씀
                ledgerData.push({ id: doc.id, ...doc.data() });
            });
            initLedgerPage(); // 장부 테이블 다시 그리기
        });
    }
});


// =========================================
// 3. [index.html] 파일 업로드 (Firebase Storage)
// =========================================
async function handleFileUpload(input) {
    const files = input.files;
    if (files.length === 0) return;

    if(!confirm(`${files.length}장의 사진을 업로드하시겠습니까?`)) return;

    // 로딩 표시 (간단하게)
    const btnLabel = document.querySelector('.fab-btn');
    const originalIcon = btnLabel.innerHTML;
    btnLabel.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; // 로딩 아이콘

    try {
        const today = new Date().toISOString().split('T')[0];
        const promises = [];

        // 파일 하나씩 업로드
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileName = `invoices/${Date.now()}_${file.name}`; // 파일명 중복 방지
            const storageRef = storage.ref().child(fileName);

            // 1. Storage에 파일 업로드
            const uploadTask = storageRef.put(file).then(snapshot => {
                return snapshot.ref.getDownloadURL(); // 2. 다운로드 URL 받기
            }).then(url => {
                // 3. Firestore에 데이터 저장 (대기열 추가)
                return db.collection(COL_PENDING).add({
                    date: today,
                    vendor: '',
                    img: url, // 인터넷 주소 저장
                    fileName: file.name,
                    isNew: true,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp() // 정렬용 시간
                });
            });
            promises.push(uploadTask);
        }

        // 모든 업로드 완료까지 대기
        await Promise.all(promises);
        
        alert("업로드가 완료되었습니다!");
        
        // 입력창 비우기
        input.value = '';
        
        // 페이지 이동 제안
        if(confirm("대기열을 정리하러 이동하시겠습니까?")) {
            location.href = 'write.html';
        }

    } catch (error) {
        console.error("Upload failed:", error);
        alert("업로드 중 오류가 발생했습니다.");
    } finally {
        btnLabel.innerHTML = originalIcon; // 아이콘 복구
    }
}

// 대시보드 카운트 업데이트
function updateDashboardCount() {
    const count = pendingList.length;
    
    // index.html 알림 카드
    const alertStrong = document.querySelector('.alert-info strong');
    if(alertStrong) alertStrong.innerText = `${count}건`;

    // write.html 헤더
    const headerStatus = document.getElementById('queueCount');
    if(headerStatus) headerStatus.innerText = count;
}


// =========================================
// 4. [write.html] 대기열 처리
// =========================================
function renderQueueList() {
    const listEl = document.getElementById('queueList');
    listEl.innerHTML = '';

    if (pendingList.length === 0) {
        listEl.innerHTML = '<li style="padding:20px; text-align:center; color:#999;">대기 중인 명세서가 없습니다.</li>';
        return;
    }
    
    pendingList.forEach((item) => {
        const li = document.createElement('li');
        if (item.id === currentSelectedId) li.classList.add('queue-item', 'active');
        else li.classList.add('queue-item');
        
        li.onclick = () => selectItem(item.id);
        
        const vendorText = item.vendor ? item.vendor : '<span style="color:red">미확인</span>';
        const badgeHtml = item.isNew ? '<span class="q-badge">NEW</span>' : '';
        const subText = item.fileName ? (item.fileName.length > 15 ? item.fileName.substr(0,12)+"..." : item.fileName) : vendorText;

        li.innerHTML = `<span class="q-title">명세서 <span style="font-size:0.8em;color:#aaa">#${item.id.substr(0,4)}</span> ${badgeHtml}</span><span class="q-date">${item.date} • ${subText}</span>`;
        listEl.appendChild(li);
    });
}

function selectItem(id) {
    currentSelectedId = id;
    const item = pendingList.find(p => p.id === id);
    if(!item) return;

    renderQueueList(); // active 갱신

    const imgEl = document.getElementById('docImage');
    imgEl.src = item.img; // Firebase URL이 들어감
    imgEl.style.display = 'block';
    document.getElementById('noSelectionMsg').style.display = 'none';
    
    // 폼 채우기
    document.getElementById('ledgerForm').reset();
    document.getElementById('dateInput').value = item.date;
    if(item.vendor) document.getElementById('vendorInput').value = item.vendor;
    
    resetZoom();
}

// [저장 버튼] 대기열 -> 장부로 이동
function saveData() {
    if (!currentSelectedId) { alert("목록을 선택해주세요."); return; }
    
    const totalInput = document.getElementById('totalInput');
    const dateInput = document.getElementById('dateInput');
    const vendorInput = document.getElementById('vendorInput');
    const typeSelect = document.getElementById('typeSelect');
    const memoInput = document.getElementById('memoInput');
    const qtyInput = document.getElementById('qtyInput');
    
    const amountStr = totalInput.value.replace(/,/g, '');
    const amount = parseInt(amountStr) || 0;

    if (!amount) { alert('금액을 입력해주세요.'); return; }

    const item = pendingList.find(p => p.id === currentSelectedId);
    
    // 1. 계산 로직
    let supply = 0, vat = 0, total = amount;
    const qty = parseInt(qtyInput.value) || null;
    const type = typeSelect.value;

    if(type === 'buy') {
        supply = Math.round(amount / 1.1); vat = amount - supply;
    } else if(type === 'pay' || type === 'return') {
        total = amount; // 양수값 저장 (타입으로 구분)
        if(type === 'return') { supply = Math.round(amount / 1.1); vat = amount - supply; }
    }

    // 2. Firestore에 장부 데이터 추가
    db.collection(COL_LEDGER).add({
        date: dateInput.value,
        type: type,
        vendor: vendorInput.value,
        memo: memoInput.value,
        qty: qty,
        supply: supply,
        vat: vat,
        total: total,
        img: item.img, // 원본 이미지 URL 연결
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        // 3. 성공하면 대기열에서 삭제
        return db.collection(COL_PENDING).doc(currentSelectedId).delete();
    }).then(() => {
        alert("처리가 완료되었습니다.");
        
        // 화면 리셋
        currentSelectedId = null;
        document.getElementById('docImage').style.display = 'none';
        document.getElementById('docImage').src = '';
        document.getElementById('noSelectionMsg').style.display = 'block';
        document.getElementById('ledgerForm').reset();
        
        // renderQueueList는 onSnapshot이 자동으로 호출함
    }).catch((error) => {
        console.error("Error writing document: ", error);
        alert("저장 중 오류가 발생했습니다.");
    });
}


// =========================================
// 5. [ledger.html] 장부 조회
// =========================================
function initLedgerPage() { filterLedger(); }

function filterLedger() {
    const vendorFilter = document.getElementById('vendorFilter').value;
    const tableBody = document.getElementById('ledgerTableBody');
    if (!tableBody) return;

    // 필터링
    let filteredData = ledgerData.filter(item => vendorFilter === 'all' || item.vendor === vendorFilter);
    
    // 정렬은 onSnapshot에서 이미 날짜순으로 가져오지만, 안전하게 한 번 더 정렬
    // filteredData.sort((a, b) => new Date(a.date) - new Date(b.date)); 

    tableBody.innerHTML = '';
    
    let sumBuy = 0, sumPay = 0, sumReturn = 0, runningBalance = 0;

    if (filteredData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:30px; color:#999;">내역이 없습니다.</td></tr>';
    }

    filteredData.forEach(item => {
        // 잔액 계산
        let rowAmount = 0;
        if (item.type === 'buy') { rowAmount = item.total; sumBuy += item.total; } 
        else if (item.type === 'pay') { rowAmount = -Math.abs(item.total); sumPay += Math.abs(item.total); } 
        else if (item.type === 'return') { rowAmount = -Math.abs(item.total); sumReturn += Math.abs(item.total); }
        runningBalance += rowAmount;

        // UI 렌더링
        let typeBadge = item.type === 'buy' ? '<span class="badge buy">입고</span>' : (item.type === 'pay' ? '<span class="badge pay">결제</span>' : '<span class="badge return">반품</span>');
        let amountClass = item.type === 'buy' ? 'amount-plus' : 'amount-minus';
        let displayTotal = (item.type === 'buy' ? '' : '-') + Math.abs(item.total).toLocaleString();
        let displayQty = item.qty ? item.qty.toLocaleString() : '-';

        // 증빙 아이콘: 이미지가 있으면 링크 걸기
        let imgIcon = '<i class="fas fa-times" style="color:#eee;"></i>';
        if(item.img) {
            imgIcon = `<a href="${item.img}" target="_blank"><i class="fas fa-image" style="cursor:pointer; color:#555;"></i></a>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.date}</td><td>${typeBadge}</td><td><strong>${item.vendor}</strong></td><td>${item.memo}</td>
            <td class="text-right">${displayQty}</td>
            <td class="text-right" style="color:#888">${item.supply ? item.supply.toLocaleString() : '-'}</td>
            <td class="text-right" style="color:#888">${item.vat ? item.vat.toLocaleString() : '-'}</td>
            <td class="text-right ${amountClass}" style="font-weight:bold;">${displayTotal}</td>
            <td class="text-right" style="background:#f0f9ff; font-weight:bold; color:#333;">${runningBalance.toLocaleString()}</td>
            <td style="text-align:center;">${imgIcon}</td>
        `;
        tableBody.appendChild(tr);
    });

    // 요약 업데이트
    document.getElementById('sumBuy').innerText = (sumBuy - sumReturn).toLocaleString();
    document.getElementById('sumPay').innerText = sumPay.toLocaleString();
    document.getElementById('sumBalance').innerText = runningBalance.toLocaleString();
    
    // 스크롤 맨 아래로 (편의)
    // if(ledgerData.length > 0) window.scrollTo(0, document.body.scrollHeight);
}

// [빠른 등록] (ledger.html)
function checkEnter(event) { if (event.key === 'Enter') saveQuickAdd(); }

function saveQuickAdd() {
    const dateEl = document.getElementById('qDate');
    const typeEl = document.getElementById('qType');
    const vendorEl = document.getElementById('qVendor');
    const memoEl = document.getElementById('qMemo');
    const qtyEl = document.getElementById('qQty');
    const amountEl = document.getElementById('qAmount');

    const amount = parseInt(amountEl.value.replace(/,/g, '')) || 0;
    const qty = parseInt(qtyEl.value) || null;

    if (!vendorEl.value || !amount) { alert("거래처와 금액을 입력해주세요."); return; }

    let supply = 0, vat = 0, total = amount;
    if(typeEl.value === 'buy') { supply = Math.round(amount / 1.1); vat = amount - supply; } 
    else { total = amount; if(typeEl.value === 'return') { supply = Math.round(amount / 1.1); vat = amount - supply; } }

    // Firestore 저장
    db.collection(COL_LEDGER).add({
        date: dateEl.value,
        type: typeEl.value,
        vendor: vendorEl.value,
        memo: memoEl.value,
        qty: qty,
        supply: supply,
        vat: vat,
        total: total,
        img: null, // 빠른 등록은 이미지 없음
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
        // 입력창 초기화
        memoEl.value = ''; qtyEl.value = ''; amountEl.value = ''; amountEl.focus();
        // 화면 갱신은 onSnapshot이 알아서 함!
    });
}


// =========================================
// 6. 유틸리티 (기존 동일)
// =========================================
function formatCurrency(input) { let v = input.value.replace(/,/g, ''); if(!isNaN(v) && v!=="") input.value = parseInt(v).toLocaleString(); }
function autoCalculate() { 
    const t = parseInt(document.getElementById('totalInput').value.replace(/,/g, '')) || 0; 
    if(t===0) return; 
    document.getElementById('supplyInput').value = Math.round(t/1.1).toLocaleString(); 
    document.getElementById('vatInput').value = (t - Math.round(t/1.1)).toLocaleString(); 
}
function togglePaymentField() { document.getElementById('paymentMethodGroup').style.display = document.getElementById('typeSelect').value === 'pay' ? 'block' : 'none'; }
function zoomIn() { currentScale += 0.2; applyZoom(); }
function zoomOut() { if (currentScale > 0.4) currentScale -= 0.2; applyZoom(); }
function resetZoom() { currentScale = 1; applyZoom(); }
function applyZoom() { const img = document.getElementById('docImage'); if(img) img.style.transform = `scale(${currentScale})`; }