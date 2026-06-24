import re

with open('mobile-app/src/screens/MaintenanceTechApp.tsx', 'r') as f:
    code = f.read()

replacements = {
    '접수 확인': 'Job Acknowledged',
    '입주민과 관리자에게 확인 알림을 보냈습니다.': 'Notified resident and admin.',
    '오류': 'Error',
    '방문 제안 시간을 입력해주세요.': 'Please enter a proposed visit time.',
    '시간 제안 완료': 'Time Proposed',
    '입주민에게 방문 시간을 제안했습니다.': 'Proposed visit time sent to resident.',
    '방문 시작': 'Visit Started',
    '입주민에게 출발 알림을 보냈습니다.': 'Notified resident of departure.',
    '승인 요청 완료': 'Approval Requested',
    '현장에서 입주민에게 비용 승인을 요청했습니다.': 'Requested cost approval from resident.',
    '작업 완료': 'Job Completed',
    '관리자 웹으로 최종 리포트가 전송되었습니다.': 'Final report sent to admin web.',
    '확인 및 방문 준비 (Acknowledge)': 'Acknowledge & Prepare',
    '❌ 입주민 시간 조정 요청: ': '❌ Resident reschedule request: ',
    '방문 시간 제안 (예: 오늘 오후 2시)': 'Propose visit time (e.g. Today 2 PM)',
    '방문 시간 전송 (Propose Time)': 'Send Proposed Time',
    '⏳ 입주민 방문 시간 확인 대기 중...': '⏳ Waiting for resident time confirmation...',
    '✅ 입주민 방문 시간 승인 완료': '✅ Resident confirmed visit time',
    '방문 시작 (Start Visit)': 'Start Visit',
    '보고서 / 승인 진행 (Write Report)': 'Proceed to Report / Approval',
    '⏳ 입주민 비용 승인 대기 중...': '⏳ Waiting for resident cost approval...',
    '진행 중인 작업이 없습니다. JOBS 탭에서 작업을 선택해주세요.': 'No active job. Please select a task from the JOBS tab.',
    '작업: ': 'Task: ',
    '1. 수리 전 사진 (Before) 및 비용 산정': '1. Before Photo & Cost Estimate',
    '비용 승인 요청 (입주민 알림)': 'Request Cost Approval (Notify Resident)',
    '2. 수리 후 사진 (After) 및 최종 완료': '2. After Photo & Finalize',
    '최종 작업 완료 보고 (관리자)': 'Submit Final Report (To Admin)',
    '{/* 5개 탭으로 확장된 하단 탭바 (실제론 4개) */}': '{/* Bottom Tab Bar */}'
}

for ko, en in replacements.items():
    code = code.replace(ko, en)

with open('mobile-app/src/screens/MaintenanceTechApp.tsx', 'w') as f:
    f.write(code)

with open('mobile-app/src/screens/MaintenanceScreen.tsx', 'r') as f:
    code = f.read()

code = code.replace('{/* [핵심] 어드민이 보낸 견적 확인 및 승인 섹션 */}', '{/* Estimate Check and Approval Section */}')

with open('mobile-app/src/screens/MaintenanceScreen.tsx', 'w') as f:
    f.write(code)

