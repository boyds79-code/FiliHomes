const fs = require('fs');

const tsvContent = `분류 (Category)\t조사 대상 (Target)\t질문 번호 (No.)\t질문 (국문)\tQuestion (English)\t응답 형태 및 선택지 (Response Format)
Billing & Verification\tPMO (Admin)\t1\t입주민들의 월 관리비 주요 결제 수단은 무엇인가요?\tWhat payment methods do residents use to pay their monthly dues?\t선택지 (Cash, GCash, Maya, Credit Card, Check, Bank Transfer, Others)
Billing & Verification\tPMO (Admin)\t2\t1번 결제 수단들의 대략적인 비율은 어떻게 되나요?\tWhat is the approximate percentage ratio of each payment method?\t주관식 (%)
Billing & Verification\tPMO (Admin)\t3\t기존에 세대별 빌링 원장을 정리하고 생성하는 방식은 무엇인가요?\tHow do you generate and organize bills for each unit? (e.g., Excel, ERP, paper)\t주관식 (텍스트)
Billing & Verification\tPMO (Admin)\t4\t현재 빌링 처리 프로세스에서 가장 불편한 점이나 병목 현상은 무엇인가요?\tWhat is the biggest pain point in your current billing process?\t주관식 (텍스트)
Billing & Verification\tPMO (Admin)\t5\t발행된 청구서를 각 세대에 어떻게 배달하며, 시간과 인력이 얼마나 소요되나요?\tHow do you deliver issued bills to each unit? How much time and labor does it take?\t주관식 (시간/인원수)
Billing & Verification\tPMO (Admin)\t6\t입주민이 청구서를 분실하거나 받지 못했다고 주장하는 경우 어떻게 처리하나요?\tWhat happens if a resident loses their printed bill or claims they never received it?\t주관식 (텍스트)
Billing & Verification\tPMO (Admin)\t7\t세대별로 결제가 완료되었다는 사실을 어떤 절차로 대조하고 승인처리 하나요?\tHow do you verify and confirm that a unit has paid?\t주관식 (텍스트)
Billing & Verification\tPMO (Admin)\t8\t100세대 분량의 수납을 확인하는 데 시간이 얼마나 걸리나요? (영수증과 실제 은행 거래 내역 대조 시간)\tHow long does it take to reconcile and verify payments for 100 units? (slips vs. statement)\t주관식 (시간 단위)
Billing & Verification\tPMO (Admin)\t9\t이 콘도의 평균 관리비 연체율은 어느 정도인가요?\tWhat is the average delinquency (overdue) rate of monthly dues in this condo?\t주관식 (%)
Billing & Verification\tPMO (Admin)\t10\t연체료 이자 계산은 실무에서 어떻게 처리하며, 연체 세대 독촉 프로세스는 어떻게 되나요?\tHow do you calculate late payment penalties, and what is your process for collecting overdue accounts?\t주관식 (텍스트)
Multi-Unit Portfolio\tPMO (Admin)\t11\t이 콘도 소유주 중 여러 유닛을 동시에 소유한 다중 소유주의 비율은 대략 얼마나 되나요?\tWhat percentage of owners in this condo own multiple units?\t주관식 (%)
Multi-Unit Portfolio\tPMO (Admin)\t12\t여러 채를 소유한 집주인들이 빌링 확인이나 유닛별 수리 이슈 업데이트를 받을 때 겪는 주요 불편 사항은 무엇인가요?\tHow are the common complaints or challenges from multi-unit owners regarding billing and maintenance updates?\t주관식 (텍스트)
Security & Gate\tGate Guard\t13\t게이트에서 방문객을 어떻게 등록하나요? 1인당 소요 시간 및 신원(ID/차량번호) 검증 방법은 무엇인가요?\tHow do you register visitors at the gate? How long does it take per visitor, and how do you verify them?\t주관식 (소요시간/설명)
Security & Gate\tGate Guard\t14\t사전 등록 없이 방문한 손님이나 배달원이 오면 입주민에게 어떻게 연락하나요?\tHow do you contact residents when a walk-in visitor or delivery rider arrives without pre-authorization?\t선택지 (Lobby Intercom, Call, Viber Message, Others)
Security & Gate\tGate Guard\t15\t로비 인터폰이 고장 나거나 입주민이 연락을 받지 않는 빈도는 얼마나 되며, 이럴 때 어떻게 대처하나요?\tHow often do lobby intercoms fail or go unanswered, and how do you handle those situations?\t주관식 (빈도/설명)
Parcel & Shift\tGate Guard\t16\t수령한 택배/우편물은 어떻게 대장에 기록하고 보관하며, 입주민에게 도착 사실을 어떻게 알리나요?\tHow do you log received parcels? Where are they stored, and how do you notify residents of their arrival?\t주관식 (텍스트)
Parcel & Shift\tGate Guard\t17\t택배 분실이나 오배송으로 인한 마찰이 얼마나 자주 발생하나요? 입주민에게 전달할 때 본인 확인은 어떻게 하나요?\tHow frequently do disputes arise over lost parcels? How do you verify identity when releasing them?\t주관식 (빈도/설명)
Parcel & Shift\tGate Guard\t18\t출퇴근 기록은 어떤 방식으로 하나요? PMO에서 가드분들의 정확한 근무 시간과 근태를 어떻게 확인하나요?\tHow do you clock in and out for your shifts? How does the PMO verify your exact duty hours and attendance?\t주관식 (텍스트)
Maintenance\tTech / Engineer\t19\t입주민이 수리(Job Order) 요청을 어떻게 접수하며, 기술자에게 작업이 어떻게 배정되나요?\tHow do residents request repairs, and how is the task assigned to technicians?\t선택지 (Paper Slip, Walkie-talkie, Viber Chat, Others)
Maintenance\tTech / Engineer\t20\t방문 일정을 입주민과 어떻게 조율하나요? 약속 시간에 집에 사람이 없으면 어떻게 처리하나요?\tHow do you coordinate the visit schedule with the resident? What if they are not home?\t주관식 (텍스트)
Maintenance\tTech / Engineer\t21\t수리 완료 후 자재비(부품)와 공임비를 입주민에게 어떻게 청구하며, 장부에 종이로 적나요 아니면 디지털로 기록하나요?\tHow do you invoice the resident for material and labor fees after repair? Is it logged on paper or digitally?\t주관식 (Paper / Digital / 설명)
Maintenance\tTech / Engineer\t22\tPMO 어드민은 이 수리 비용을 다음 달 관리비 청구서에 어떻게 합산하나요? 이 연동 과정에 며칠이 걸리나요?\tHow does the PMO add these repair costs to the resident's next monthly bill? How long does this sync take?\t주관식 (소요 일수/설명)
Maintenance\tTech / Engineer\t23\t현장 소통을 위해 무전기나 메신저(Viber 등)를 사용하나요? 근무 중 의사소통 시 발생하는 가장 큰 애로사항은 무엇인가요?\tDo you use walkie-talkies or chat apps (Viber) for on-site communication? What are the biggest communication barriers?\t주관식 (텍스트)
`;

// Helper to escape CSV values
function escapeCsv(str) {
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const csvRows = tsvContent.trim().split('\n').map(row => {
  return row.split('\t').map(escapeCsv).join(',');
}).join('\n');

// Write TSV
fs.writeFileSync('/Users/chriskim/Documents/FiliCondo/survey_questions.tsv', tsvContent, 'utf-8');

// Write CSV with UTF-8 BOM for MS Excel compatibility
fs.writeFileSync('/Users/chriskim/Documents/FiliCondo/survey_questions.csv', '\ufeff' + csvRows, 'utf-8');

console.log("TSV and CSV files successfully created in the workspace!");
