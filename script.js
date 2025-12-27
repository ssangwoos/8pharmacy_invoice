/* script.js - write.html 수량 기능 포함 완성본 */

// =========================================
// 1. 공통 데이터 (가상 DB)
// =========================================

// (1) 대기열 데이터 (write.html 용)
let pendingList = [
    { id: 101, date: '2025-12-27', vendor: '유한양행', img: 'https://via.placeholder.com/600x800.png?text=Invoice+101', isNew: true },
    { id: 102, date: '2025-12-26', vendor: '', img: 'https://via.placeholder.com/600x800.png?text=Invoice+102', isNew: false },
    { id: 103, date: '2025-12-25', vendor: '종근당', img: 'https://via.placeholder.com/600x800.png?text=Invoice+103', isNew: true }
];

// (2) 장부 데이터 (ledger.html 용) 
const ledgerData = [
    { date: '2025-12-24', type: 'buy', vendor: '녹십자', memo: '백신 입고', qty: 10, supply: 1000000, vat: 100000, total: 1100000 },
    { date: '2025-12-24', type: 'buy', vendor: '유한양행', memo: '추가 주문', qty: 5, supply: 200000, vat: 20000, total: 220000 },
    { date: '2025-12-25', type: 'return', vendor: '유한양행', memo: '파손품 반품', qty: 2, supply: -45455, vat: -4545, total: -50000 },
    { date: '2025-12-26', type: 'pay', vendor: '종근당', memo: '11월 잔액 결제', qty: null, supply: 0, vat: 0, total: 2000000 }, 
    { date: '2025-12-27', type: 'buy', vendor: '유한양행', memo: '정기 의약품 입고', qty: 50, supply: 500000, vat: 50000, total: 550000 },
];

let currentSelectedId = null;
let currentScale = 1;


// =========================================
// 2. 초기화
// =========================================
document.addEventListener('DOMContentLoaded', function() {
    if(document.getElementById('queueList')) renderQueueList();
    if(document.getElementById('ledgerTableBody')) initLedgerPage();
    
    const dateInputs = document.querySelectorAll('input[type="date"]');
    dateInputs.forEach(input => input.valueAsDate = new Date());
});


// =========================================
// 3. [write.html] 대기열 로직 (수량 처리 추가됨)
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
        li.innerHTML = `<span class="q-title">명세서 #${item.id} ${badgeHtml}</span><span class="q-date">${item.date} • ${vendorText}</span>`;
        listEl.appendChild(li);
    });
}

function selectItem(id) {
    currentSelectedId = id;
    const item = pendingList.find(p => p.id === id);
    renderQueueList();
    
    // 이미지 처리
    const imgEl = document.getElementById('docImage');
    imgEl.src = item.img;
    imgEl.style.display = 'block';
    document.getElementById('noSelectionMsg').style.display = 'none';
    
    // 폼 리셋 및 채우기
    document.getElementById('ledgerForm').reset();
    document.getElementById('dateInput').value = item.date;
    if(item.vendor) document.getElementById('vendorInput').value = item.vendor;
    
    // 수량이나 메모 등 초기화 확인
    if(document.getElementById('qtyInput')) document.getElementById('qtyInput').value = '';
    
    resetZoom();
}

function saveData() {
    if (currentSelectedId === null) { alert("목록을 선택해주세요."); return; }
    
    const totalInput = document.getElementById('totalInput');
    const qtyInput = document.getElementById('qtyInput'); // 수량 필드
    const memoInput = document.getElementById('memoInput'); // 메모 필드 (혹시 id가 없다면 html에 추가해야 함)

    if (!totalInput.value) { alert('금액을 입력해주세요.'); return; }

    // 실제 데이터 저장 로직 (여기선 시뮬레이션)
    const savedQty = qtyInput ? qtyInput.value : 0;
    
    // 알림 및 목록 제거
    alert(`명세서 #${currentSelectedId} 저장 완료 (수량: ${savedQty})`);
    
    pendingList = pendingList.filter(item => item.id !== currentSelectedId);
    currentSelectedId = null;
    
    // 화면 초기화
    document.getElementById('docImage').style.display = 'none';
    document.getElementById('noSelectionMsg').style.display = 'block';
    document.getElementById('ledgerForm').reset();
    renderQueueList();
}


// =========================================
// 4. [ledger.html] 장부 조회 (정렬 및 잔액 계산)
// =========================================
function initLedgerPage() {
    filterLedger();
}

function filterLedger() {
    const vendorFilter = document.getElementById('vendorFilter').value;
    const tableBody = document.getElementById('ledgerTableBody');
    if (!tableBody) return;

    // 1. 필터링
    let filteredData = ledgerData.filter(item => {
        return vendorFilter === 'all' || item.vendor === vendorFilter;
    });

    // 2. 정렬 (과거 -> 미래 순)
    filteredData.sort((a, b) => new Date(a.date) - new Date(b.date));

    tableBody.innerHTML = '';
    
    let sumBuy = 0, sumPay = 0, sumReturn = 0;
    let runningBalance = 0;

    if (filteredData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:30px; color:#999;">해당 내역이 없습니다.</td></tr>';
    }

    filteredData.forEach(item => {
        let rowAmount = 0;
        
        if (item.type === 'buy') {
            rowAmount = item.total;
            sumBuy += item.total;
        } else if (item.type === 'pay') {
            rowAmount = -Math.abs(item.total);
            sumPay += Math.abs(item.total);
        } else if (item.type === 'return') {
            rowAmount = -Math.abs(item.total);
            sumReturn += Math.abs(item.total);
        }

        runningBalance += rowAmount;

        let typeBadge = '', amountClass = '', displayTotal = '';
        if(item.type === 'buy') {
            typeBadge = '<span class="badge buy">입고</span>';
            amountClass = 'amount-plus';
            displayTotal = item.total.toLocaleString();
        } else if(item.type === 'pay') {
            typeBadge = '<span class="badge pay">결제</span>';
            amountClass = 'amount-minus';
            displayTotal = '-' + Math.abs(item.total).toLocaleString();
        } else {
            typeBadge = '<span class="badge return">반품</span>';
            displayTotal = '-' + Math.abs(item.total).toLocaleString();
        }

        const displayQty = item.qty ? item.qty.toLocaleString() : '-';
        const displayBalance = runningBalance.toLocaleString();

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.date}</td>
            <td>${typeBadge}</td>
            <td><strong>${item.vendor}</strong></td>
            <td>${item.memo}</td>
            <td class="text-right">${displayQty}</td>
            <td class="text-right" style="color:#888">${item.supply ? item.supply.toLocaleString() : '-'}</td>
            <td class="text-right" style="color:#888">${item.vat ? item.vat.toLocaleString() : '-'}</td>
            <td class="text-right ${amountClass}" style="font-weight:bold;">${displayTotal}</td>
            <td class="text-right" style="background:#f0f9ff; font-weight:bold; color:#333;">${displayBalance}</td>
            <td style="text-align:center;"><i class="fas fa-image" style="cursor:pointer; color:#ccc;"></i></td>
        `;
        tableBody.appendChild(tr);
    });

    document.getElementById('sumBuy').innerText = (sumBuy - sumReturn).toLocaleString();
    document.getElementById('sumPay').innerText = sumPay.toLocaleString();
    document.getElementById('sumBalance').innerText = runningBalance.toLocaleString();
}


// =========================================
// 5. [ledger.html] 빠른 등록
// =========================================

function checkEnter(event) {
    if (event.key === 'Enter') saveQuickAdd();
}

function saveQuickAdd() {
    const dateEl = document.getElementById('qDate');
    const typeEl = document.getElementById('qType');
    const vendorEl = document.getElementById('qVendor');
    const memoEl = document.getElementById('qMemo');
    const qtyEl = document.getElementById('qQty');
    const amountEl = document.getElementById('qAmount');

    const amountStr = amountEl.value.replace(/,/g, '');
    const amount = parseInt(amountStr) || 0;
    const qty = parseInt(qtyEl.value) || null;

    if (!vendorEl.value) { alert("거래처를 입력해주세요."); vendorEl.focus(); return; }
    if (amount === 0) { alert("금액을 입력해주세요."); amountEl.focus(); return; }

    let supply = 0, vat = 0, total = amount;
    if(typeEl.value === 'buy') {
        supply = Math.round(amount / 1.1);
        vat = amount - supply;
    } else if(typeEl.value === 'pay' || typeEl.value === 'return') {
        total = amount;
        if(typeEl.value === 'return') {
            supply = Math.round(amount / 1.1);
            vat = amount - supply;
        }
    }

    const newData = {
        date: dateEl.value,
        type: typeEl.value,
        vendor: vendorEl.value,
        memo: memoEl.value,
        qty: qty,
        supply: supply,
        vat: vat,
        total: total 
    };

    ledgerData.push(newData);
    filterLedger();

    memoEl.value = '';
    qtyEl.value = '';
    amountEl.value = '';
    amountEl.focus();

    setTimeout(() => {
        window.scrollTo(0, document.body.scrollHeight);
    }, 100);
}


// =========================================
// 6. 유틸리티
// =========================================
function formatCurrency(input) {
    let value = input.value.replace(/,/g, '');
    if (!isNaN(value) && value !== "") input.value = parseInt(value).toLocaleString();
}
function autoCalculate() { 
    const total = parseInt(document.getElementById('totalInput').value.replace(/,/g, '')) || 0;
    if (total === 0) return;
    const supply = Math.round(total / 1.1);
    document.getElementById('supplyInput').value = supply.toLocaleString();
    document.getElementById('vatInput').value = (total - supply).toLocaleString();
}
function togglePaymentField() { 
    const type = document.getElementById('typeSelect').value;
    document.getElementById('paymentMethodGroup').style.display = (type === 'pay') ? 'block' : 'none';
}
function zoomIn() { currentScale += 0.2; applyZoom(); }
function zoomOut() { if (currentScale > 0.4) currentScale -= 0.2; applyZoom(); }
function resetZoom() { currentScale = 1; applyZoom(); }
function applyZoom() { 
    const img = document.getElementById('docImage');
    if(img) img.style.transform = `scale(${currentScale})`; 
}