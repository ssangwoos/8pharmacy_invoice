/* script.js - 파일 업로드 및 데이터 연동 강화 버전 */

// =========================================
// 1. 공통 데이터 관리 (LocalStorage 연동)
// =========================================

// 초기 더미 데이터 (처음에만 사용)
const initialPendingData = [
    { id: 101, date: '2025-12-27', vendor: '유한양행', img: 'https://via.placeholder.com/600x800.png?text=Invoice+101', isNew: true },
    { id: 102, date: '2025-12-26', vendor: '', img: 'https://via.placeholder.com/600x800.png?text=Invoice+102', isNew: false },
    { id: 103, date: '2025-12-25', vendor: '종근당', img: 'https://via.placeholder.com/600x800.png?text=Invoice+103', isNew: true }
];

// 장부 데이터
const ledgerData = [
    { date: '2025-12-24', type: 'buy', vendor: '녹십자', memo: '백신 입고', qty: 10, supply: 1000000, vat: 100000, total: 1100000 },
    { date: '2025-12-24', type: 'buy', vendor: '유한양행', memo: '추가 주문', qty: 5, supply: 200000, vat: 20000, total: 220000 },
    { date: '2025-12-25', type: 'return', vendor: '유한양행', memo: '파손품 반품', qty: 2, supply: -45455, vat: -4545, total: -50000 },
    { date: '2025-12-26', type: 'pay', vendor: '종근당', memo: '11월 잔액 결제', qty: null, supply: 0, vat: 0, total: 2000000 }, 
    { date: '2025-12-27', type: 'buy', vendor: '유한양행', memo: '정기 의약품 입고', qty: 50, supply: 500000, vat: 50000, total: 550000 },
];

// 대기열 데이터 불러오기 (저장된 게 없으면 초기 데이터 사용)
let pendingList = JSON.parse(localStorage.getItem('pharmacy_queue')) || initialPendingData;

let currentSelectedId = null;
let currentScale = 1;


// =========================================
// 2. 초기화
// =========================================
document.addEventListener('DOMContentLoaded', function() {
    // 1) write.html: 대기 목록 렌더링
    if(document.getElementById('queueList')) renderQueueList();
    
    // 2) ledger.html: 장부 렌더링
    if(document.getElementById('ledgerTableBody')) initLedgerPage();
    
    // 3) index.html: 미처리 건수 배지 업데이트
    updateDashboardCount();

    // 공통: 날짜 기본값
    const dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach(input => input.valueAsDate = new Date());
});


// =========================================
// 3. [index.html] 파일 업로드 핸들러 (New!)
// =========================================
function handleFileUpload(input) {
    const files = input.files;
    if (files.length === 0) return;

    let addedCount = 0;
    const today = new Date().toISOString().split('T')[0];

    // 선택된 파일들을 대기열에 추가
    Array.from(files).forEach((file, index) => {
        // ID 생성 (현재 시간 + 인덱스)
        const newId = Date.now() + index;
        
        const newItem = {
            id: newId,
            date: today,
            vendor: '', // 자동인식 전이므로 공란
            // 실제 이미지는 서버가 없으므로 로컬 URL 생성 (브라우저 닫으면 만료됨)
            // 주의: 실제 앱에선 Firebase Storage URL이 들어감
            img: URL.createObjectURL(file), 
            isNew: true,
            fileName: file.name
        };

        pendingList.unshift(newItem); // 맨 앞에 추가
        addedCount++;
    });

    // 변경된 대기열 저장
    saveQueue();
    updateDashboardCount();

    // 알림 및 페이지 이동 제안
    if(confirm(`${addedCount}장의 명세서가 대기열에 등록되었습니다.\n지금 정리하러 가시겠습니까?`)) {
        location.href = 'write.html';
    } else {
        // 계속 대시보드에 머무름
        input.value = ''; // 입력창 초기화 (같은 파일 다시 선택 가능하게)
    }
}

// 대기열 변경 시 LocalStorage 저장
function saveQueue() {
    // 주의: URL.createObjectURL은 저장되지 않으므로, 
    // 실제 서비스에선 여기서 이미지를 서버로 업로드해야 함.
    // 현재 프로토타입에선 새로고침 시 이미지가 깨질 수 있음 (이미지 파일 자체는 저장 불가)
    localStorage.setItem('pharmacy_queue', JSON.stringify(pendingList));
}

// 대시보드 알림 카드 숫자 업데이트
function updateDashboardCount() {
    // 알림 카드 안의 strong 태그 찾기 (간단한 선택자 사용)
    const alertStrong = document.querySelector('.alert-info strong');
    if(alertStrong) {
        alertStrong.innerText = `${pendingList.length}건`;
    }
    
    // 헤더의 상태 텍스트 업데이트 (write.html 용)
    const headerStatus = document.getElementById('queueCount');
    if(headerStatus) {
        headerStatus.innerText = pendingList.length;
    }
}


// =========================================
// 4. [write.html] 대기열 처리 로직
// =========================================
function renderQueueList() {
    const listEl = document.getElementById('queueList');
    const countEl = document.getElementById('queueCount');
    listEl.innerHTML = '';
    countEl.innerText = pendingList.length;

    if (pendingList.length === 0) {
        listEl.innerHTML = '<li style="padding:20px; text-align:center; color:#999;">처리할 내역이 없습니다.</li>';
        return;
    }
    
    pendingList.forEach((item) => {
        const li = document.createElement('li');
        if (item.id === currentSelectedId) li.classList.add('queue-item', 'active');
        else li.classList.add('queue-item');
        
        li.onclick = () => selectItem(item.id);
        
        const vendorText = item.vendor ? item.vendor : '<span style="color:red">미확인</span>';
        const badgeHtml = item.isNew ? '<span class="q-badge">NEW</span>' : '';
        
        // 파일명이 있으면 표시 (업로드한 파일인 경우)
        const subText = item.fileName ? item.fileName : vendorText;

        li.innerHTML = `<span class="q-title">명세서 #${item.id} ${badgeHtml}</span><span class="q-date">${item.date} • ${subText}</span>`;
        listEl.appendChild(li);
    });
}

function selectItem(id) {
    currentSelectedId = id;
    const item = pendingList.find(p => p.id === id);
    renderQueueList();
    
    const imgEl = document.getElementById('docImage');
    // 이미지가 Blob URL인지 플레이스홀더인지 확인
    imgEl.src = item.img;
    imgEl.style.display = 'block';
    document.getElementById('noSelectionMsg').style.display = 'none';
    
    document.getElementById('ledgerForm').reset();
    document.getElementById('dateInput').value = item.date;
    if(item.vendor) document.getElementById('vendorInput').value = item.vendor;
    if(document.getElementById('qtyInput')) document.getElementById('qtyInput').value = '';
    
    resetZoom();
}

function saveData() {
    if (currentSelectedId === null) { alert("목록을 선택해주세요."); return; }
    
    const totalInput = document.getElementById('totalInput');
    const qtyInput = document.getElementById('qtyInput');

    if (!totalInput.value) { alert('금액을 입력해주세요.'); return; }

    const savedQty = qtyInput ? qtyInput.value : 0;
    
    alert(`명세서 #${currentSelectedId} 처리 완료!`);
    
    // 목록에서 제거 후 저장
    pendingList = pendingList.filter(item => item.id !== currentSelectedId);
    saveQueue(); // 변경사항 저장
    
    currentSelectedId = null;
    
    document.getElementById('docImage').style.display = 'none';
    document.getElementById('noSelectionMsg').style.display = 'block';
    document.getElementById('ledgerForm').reset();
    renderQueueList();
}


// =========================================
// 5. [ledger.html] 장부 조회 (기존 유지)
// =========================================
function initLedgerPage() { filterLedger(); }

function filterLedger() {
    const vendorFilter = document.getElementById('vendorFilter').value;
    const tableBody = document.getElementById('ledgerTableBody');
    if (!tableBody) return;

    let filteredData = ledgerData.filter(item => vendorFilter === 'all' || item.vendor === vendorFilter);
    filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));

    tableBody.innerHTML = '';
    let sumBuy = 0, sumPay = 0, sumReturn = 0, runningBalance = 0;

    if (filteredData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:30px; color:#999;">해당 내역이 없습니다.</td></tr>';
    }

    filteredData.forEach(item => {
        let rowAmount = 0;
        if (item.type === 'buy') { rowAmount = item.total; sumBuy += item.total; } 
        else if (item.type === 'pay') { rowAmount = -Math.abs(item.total); sumPay += Math.abs(item.total); } 
        else if (item.type === 'return') { rowAmount = -Math.abs(item.total); sumReturn += Math.abs(item.total); }
        runningBalance += rowAmount;

        let typeBadge = item.type === 'buy' ? '<span class="badge buy">입고</span>' : (item.type === 'pay' ? '<span class="badge pay">결제</span>' : '<span class="badge return">반품</span>');
        let amountClass = item.type === 'buy' ? 'amount-plus' : 'amount-minus';
        let displayTotal = (item.type === 'buy' ? '' : '-') + Math.abs(item.total).toLocaleString();
        let displayQty = item.qty ? item.qty.toLocaleString() : '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.date}</td><td>${typeBadge}</td><td><strong>${item.vendor}</strong></td><td>${item.memo}</td>
            <td class="text-right">${displayQty}</td>
            <td class="text-right" style="color:#888">${item.supply ? item.supply.toLocaleString() : '-'}</td>
            <td class="text-right" style="color:#888">${item.vat ? item.vat.toLocaleString() : '-'}</td>
            <td class="text-right ${amountClass}" style="font-weight:bold;">${displayTotal}</td>
            <td class="text-right" style="background:#f0f9ff; font-weight:bold; color:#333;">${runningBalance.toLocaleString()}</td>
            <td style="text-align:center;"><i class="fas fa-image" style="cursor:pointer; color:#ccc;"></i></td>
        `;
        tableBody.appendChild(tr);
    });
    
    document.getElementById('sumBuy').innerText = (sumBuy - sumReturn).toLocaleString();
    document.getElementById('sumPay').innerText = sumPay.toLocaleString();
    document.getElementById('sumBalance').innerText = runningBalance.toLocaleString();
}


// =========================================
// 6. [ledger.html] 빠른 등록
// =========================================
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

    if (!vendorEl.value) { alert("거래처를 입력해주세요."); vendorEl.focus(); return; }
    if (amount === 0) { alert("금액을 입력해주세요."); amountEl.focus(); return; }

    let supply = 0, vat = 0, total = amount;
    if(typeEl.value === 'buy') { supply = Math.round(amount / 1.1); vat = amount - supply; } 
    else { total = amount; if(typeEl.value === 'return') { supply = Math.round(amount / 1.1); vat = amount - supply; } }

    ledgerData.push({ date: dateEl.value, type: typeEl.value, vendor: vendorEl.value, memo: memoEl.value, qty: qty, supply: supply, vat: vat, total: total });
    filterLedger();
    
    memoEl.value = ''; qtyEl.value = ''; amountEl.value = ''; amountEl.focus();
    setTimeout(() => window.scrollTo(0, document.body.scrollHeight), 100);
}


// =========================================
// 7. 유틸리티
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