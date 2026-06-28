import { jsPDF } from "jspdf";

// 헬퍼 함수: 숫자를 영문 단어(말)로 변환 (Pesos 표기용)
function numberToWords(num: number): string {
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const scales = ["", "Thousand", "Million", "Billion"];

  if (num === 0) return "Zero";

  // 소수점 이하(Centavos)와 정수(Pesos) 분리
  let parts = num.toFixed(2).split(".");
  let pesosAmount = parseInt(parts[0]);
  let centavosAmount = parseInt(parts[1]);

  let n = pesosAmount;
  let words = [];
  let scaleIndex = 0;

  while (n > 0) {
    let chunk = n % 1000;
    if (chunk > 0) {
      let chunkWords = [];
      let hundreds = Math.floor(chunk / 100);
      let remainder = chunk % 100;

      if (hundreds > 0) {
        chunkWords.push(ones[hundreds] + " Hundred");
      }
      if (remainder > 0) {
        if (remainder < 20) {
          chunkWords.push(ones[remainder]);
        } else {
          let t = Math.floor(remainder / 10);
          let o = remainder % 10;
          chunkWords.push(tens[t] + (o > 0 ? "-" + ones[o] : ""));
        }
      }
      if (scales[scaleIndex]) {
        chunkWords.push(scales[scaleIndex]);
      }
      words.unshift(chunkWords.join(" "));
    }
    n = Math.floor(n / 1000);
    scaleIndex++;
  }

  let result = words.join(" ") + " Pesos";
  if (centavosAmount > 0) {
    let centsWords = [];
    if (centavosAmount < 20) {
      centsWords.push(ones[centavosAmount]);
    } else {
      let t = Math.floor(centavosAmount / 10);
      let o = centavosAmount % 10;
      centsWords.push(tens[t] + (o > 0 ? "-" + ones[o] : ""));
    }
    result += " and " + centsWords.join(" ") + " Centavos";
  }
  return result + " Only";
}

const loadImageAsBase64 = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      reject(new Error("DOM/Window context not available"));
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const dataURL = canvas.toDataURL("image/png");
          resolve(dataURL);
        } else {
          reject(new Error("Canvas context is null"));
        }
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = (err) => reject(new Error("Image failed to load"));
    img.src = url;
  });
};

export const generateOfficialReceipt = async (bill: any, condoInfo: any = {}) => {
  // 0. 프리로드: 디지털 서명 이미지가 있다면 Base64 데이터로 변환
  let signatureBase64: string | null = null;
  if (condoInfo.signature_url) {
    try {
      signatureBase64 = await loadImageAsBase64(condoInfo.signature_url);
    } catch (err) {
      console.error("Failed to load signature image as Base64:", err);
    }
  }

  // 1. 가로 방향(Landscape) A4 문서 생성 (가로: 297mm, 세로: 210mm)
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4"
  });

  const totalAmount = parseFloat(bill.totalAmount || bill.amount || 0);

  // 2. 외곽 테두리 및 뼈대 그리기 (여백 8mm 적용)
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(8, 8, 281, 194); // 외곽 메인 박스

  // 세로 구분선 (왼쪽 1/3 영역 분할)
  // 왼쪽 열 너비: 82mm (x: 8 ~ 90), 오른쪽 열 너비: 199mm (x: 90 ~ 289)
  doc.line(90, 8, 90, 180);

  // 하단 Footer 구분 가로선
  doc.line(8, 180, 289, 180);

  /* ========================================================================= */
  /* 📊 LEFT COLUMN (IN PAYMENT OF 테이블 및 세금 정산) */
  /* ========================================================================= */
  
  // 1) "IN PAYMENT OF:" 타이틀 바
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("IN PAYMENT OF:", 49, 13, { align: "center" });
  doc.line(8, 15, 90, 15);

  // 2) PARTICULARS | AMOUNT 헤더 라인
  doc.text("PARTICULARS", 34, 19, { align: "center" });
  doc.text("AMOUNT", 75, 19, { align: "center" });
  doc.line(8, 21, 90, 21);
  doc.line(60, 15, 60, 180); // particulars / amount 세로 분할선

  // 3) 세부 요금 항목 리스트
  const particulars = [
    { label: "Condo Dues", val: parseFloat(bill.condo_dues || 0) },
    { label: "Electricity Bill", val: parseFloat(bill.electricity || 0) },
    { label: "Water Bill", val: parseFloat(bill.water || 0) },
    { label: "Parking Fee", val: parseFloat(bill.parking_fee || 0) },
    { label: "Visitor Parking", val: parseFloat(bill.visitor_parking_fee || 0) },
    { label: "Amenity Booking", val: parseFloat(bill.amenity_fee || 0) },
    { label: "Job Order Repair", val: parseFloat(bill.job_order_fee || 0) }
  ];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  let currentY = 25;
  const rowHeight = 7;

  particulars.forEach((p) => {
    doc.text(p.label, 11, currentY);
    if (p.val > 0) {
      doc.text(p.val.toLocaleString(undefined, { minimumFractionDigits: 2 }), 87, currentY, { align: "right" });
    }
    doc.line(8, currentY + 2, 90, currentY + 2);
    currentY += rowHeight;
  });

  // 4) 요약 계산서 영역 (y = 74 ~ 116)
  // BIR 공식 OR의 세금 분리 계산 공식 적용
  const vatRate = 0.12;
  const isVatRegistered = condoInfo.is_vat_registered === true;
  
  let vatableSales = 0;
  let vatAmount = 0;
  let vatExempt = 0;

  if (isVatRegistered) {
    // 12% VAT 포함 가격에서 역산
    vatableSales = totalAmount / (1 + vatRate);
    vatAmount = totalAmount - vatableSales;
  } else {
    vatExempt = totalAmount; // 비과세/면세 매출로 처리
  }

  const totals = [
    { label: "TOTAL SALES (VAT Inclusive)", val: totalAmount },
    { label: "Less: Withholding Tax", val: 0.00 },
    { label: "TOTAL AMOUNT DUE", val: totalAmount },
    { label: "Vatable Sales", val: vatableSales },
    { label: "VAT-Exempt Sales", val: vatExempt },
    { label: "VAT Zero Rated Sales", val: 0.00 },
    { label: "VAT Amount", val: vatAmount }
  ];

  totals.forEach((t) => {
    // 강조 항목
    if (t.label === "TOTAL AMOUNT DUE") {
      doc.setFont("helvetica", "bold");
    } else {
      doc.setFont("helvetica", "normal");
    }
    doc.text(t.label, 11, currentY);
    doc.text(t.val.toLocaleString(undefined, { minimumFractionDigits: 2 }), 87, currentY, { align: "right" });
    doc.line(8, currentY + 2, 90, currentY + 2);
    currentY += rowHeight;
  });

  // 5) Form of Payment (지불 수단 마크)
  doc.setFont("helvetica", "bold");
  doc.text("Form of Payment:", 11, currentY + 3);
  doc.setFont("helvetica", "normal");

  const method = (bill.payment_method || "CASH").toUpperCase();
  const isCash = method === "CASH";
  
  // 체크박스 수동 드로잉
  doc.rect(48, currentY + 1, 3, 3);
  doc.text("Cash", 53, currentY + 4);
  if (isCash) {
    doc.setFont("helvetica", "bold");
    doc.text("X", 49, currentY + 4);
    doc.setFont("helvetica", "normal");
  }

  doc.rect(68, currentY + 1, 3, 3);
  doc.text("Check/Card", 73, currentY + 4);
  if (!isCash) {
    doc.setFont("helvetica", "bold");
    doc.text("X", 69, currentY + 4);
    doc.setFont("helvetica", "normal");
  }

  /* ========================================================================= */
  /* 📄 RIGHT COLUMN (회사 정보, 영수증 메인 타이틀, 서술 텍스트) */
  /* ========================================================================= */
  
  // 1) PMO 회사 정보 헤더 (우측 상단 배치)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  const condoName = condoInfo.business_name || condoInfo.businessName || "Fili-One Condominium Management Corp.";
  doc.text(condoName, 280, 16, { align: "right" });
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const address = condoInfo.address || "Mactan, Cebu, Philippines";
  const tin = condoInfo.tin || "001-234-567-000";
  doc.text(address, 280, 21, { align: "right" });
  doc.text(`VAT REG. TIN: ${tin}`, 280, 26, { align: "right" });

  // 2) OFFICIAL RECEIPT 타이틀 (중앙 상단)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("OFFICIAL RECEIPT", 98, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text("(Real Estate / Condominium Association)", 98, 43);

  // 3) 영수증 번호 & 발행일 (우측 상단)
  doc.setFontSize(10);
  doc.text(`No.: OR-${String(bill.id || '0000').padStart(6, '0')}`, 280, 38, { align: "right" });
  
  const paymentDate = bill.paid_at ? new Date(bill.paid_at) : new Date();
  const dateStr = paymentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  doc.text(`Date: ${dateStr}`, 280, 45, { align: "right" });

  // 4) 영수증 메인 서술 구문 (받는 사람, 주소, 금액 텍스트 등)
  doc.setFontSize(10.5);
  const payerName = bill.profiles?.full_name || bill.fullName || `Resident of Unit ${bill.unit_number}`;
  const unitText = bill.unit_number ? `Unit ${bill.unit_number}` : "N/A";
  
  // Received From ...
  doc.text("Received from", 98, 59);
  doc.setFont("helvetica", "bold");
  doc.text(payerName, 126, 59);
  doc.setFont("helvetica", "normal");
  doc.text("with TIN", 225, 59);
  doc.line(125, 60, 222, 60); // Underline for Received From
  doc.line(242, 60, 280, 60); // Underline for TIN (N/A)
  doc.text("N/A", 255, 59);

  // Address ...
  doc.text("and address at", 98, 70);
  doc.text(`${unitText}, Fili-One Condominium, ${address}`, 125, 70);
  doc.line(124, 71, 252, 71);
  doc.text("engaged in", 255, 70);

  // Business Style ...
  doc.text("the business style of", 98, 81);
  doc.text("N/A", 138, 81);
  doc.line(136, 82, 225, 82);
  doc.text(", the sum of", 226, 81);

  // Sum of Pesos ...
  doc.text("Pesos", 98, 92);
  doc.setFont("helvetica", "bold");
  const wordsAmount = numberToWords(totalAmount);
  // 긴 영문 단어가 줄바꿈되지 않도록 폰트 크기 동적 조절
  if (wordsAmount.length > 55) doc.setFontSize(9);
  doc.text(wordsAmount, 112, 92);
  doc.setFontSize(10.5);
  doc.setFont("helvetica", "normal");
  doc.line(110, 93, 218, 93);
  doc.text(`( P`, 221, 92);
  doc.setFont("helvetica", "bold");
  doc.text(totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }), 230, 92);
  doc.setFont("helvetica", "normal");
  doc.text(` )`, 276, 92);
  doc.line(227, 93, 275, 93);

  // In full/partial payment for ...
  doc.text("in full/partial payment for", 98, 103);
  const purpose = bill.description || `Condo dues & utilities for ${bill.billing_month || 'Current Month'}`;
  doc.text(purpose, 145, 103);
  doc.line(143, 104, 280, 104);

  // 5) 수동 지불 정보 (Check No, Bank, Cash)
  doc.setFontSize(9);
  doc.text("Check No.: ________________________", 98, 125);
  doc.text("Bank: ____________________________", 98, 134);
  doc.text("Cashier: __________________________", 98, 143);

  // 6) Authorized Signature 서명란
  doc.setFont("helvetica", "bold");
  doc.text("Authorized Signature", 220, 155);
  doc.setFont("helvetica", "normal");
  doc.line(195, 150, 280, 150); // Signature line

  // 만약 PMO 서명 이미지가 등록되어 있다면 얹어서 보여줍니다.
  if (signatureBase64) {
    try {
      doc.addImage(signatureBase64, 'PNG', 205, 128, 65, 20);
    } catch (sigErr) {
      console.log("Error loading signature image (base64) onto jsPDF:", sigErr);
    }
  } else if (condoInfo.signature_url) {
    try {
      doc.addImage(condoInfo.signature_url, 'PNG', 205, 128, 65, 20);
    } catch (sigErr) {
      console.log("Error loading signature image (raw URL) onto jsPDF:", sigErr);
    }
  }

  // 7) Accreditation info
  doc.setFontSize(8);
  doc.text("BIR Accreditation No: 104-9988224-00000", 195, 163);
  doc.text("Accreditation Date: May 15, 2026", 195, 168);

  /* ========================================================================= */
  /* 🏷️ FOOTER (BIR 인가 관련 필수 문구 및 ATP 정보) */
  /* ========================================================================= */
  
  doc.setFontSize(8.5);
  const atpNo = condoInfo.atp_number || "ATP-000-1234567890-00000";
  const atpDate = condoInfo.atp_date || "2026-05-15";
  doc.text(`BIR ATP No.: ${atpNo}`, 12, 187);
  doc.text(`Date Issued: ${atpDate}`, 12, 193);
  doc.text(`Valid until: May 15, 2031`, 78, 193);

  doc.setFont("helvetica", "bold");
  doc.text("*THIS OFFICIAL RECEIPT SHALL BE VALID FOR FIVE (5) YEARS FROM THE DATE OF ATP*", 134, 193);

  // 3. PDF 저장 실행
  doc.save(`Official_Receipt_Unit_${bill.unit_number || 'N/A'}_${bill.billing_month || 'Statement'}.pdf`);
};