import re

file_path = '/Users/chriskim/Documents/FiliCondo/mobile-app/src/screens/FiliStaffGuardMain.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

replacements = [
    (r"// 🎯 테스트할 콘도 ID를 확실하게 넣어줍니다\.", r"// 🎯 Make sure to explicitly include the condo ID for testing."),
    (r"// 수정: id\(1\)이 아니라 condo_id로 조회", r"// Fix: query by condo_id instead of id(1)"),
    (r"// 🎯 콘솔에 데이터 확인용 로그 추가!", r"// 🎯 Add log for verifying data in console!"),
    (r'console\.log\("⚠️ 정책 데이터를 찾을 수 없습니다\."\);', r'console.log("⚠️ Policy data not found.");'),
    (r"// 🎯 입주자가 승인하면 경비원 앱에서 즉시 감지!", r"// 🎯 Detect immediately in Guard App when resident approves!"),
    (r'Alert\.alert\("✅ Resident Approval", `\$\{payload\.new\.visitor_name\}님의 입장이 승인되었습니다\."\);', r'Alert.alert("✅ Resident Approval", `${payload.new.visitor_name}\'s entry has been approved.`);'),
    (r'Alert\.alert\("✅ Resident Approval", `\$\{payload\.new\.visitor_name\}님의 입장이 승인되었습니다\.`\);', r'Alert.alert("✅ Resident Approval", `${payload.new.visitor_name}\'s entry has been approved.`);'),
    (r"// 필요시 가드 앱의 로컬 상태나 리스트 갱신 함수 호출", r"// Call local state or list refresh function of Guard App if needed"),
    (r"// 🎯 Condo ID를 변수로 확실히 고정하고 검색 조건에 포함하세요!", r"// 🎯 Fix Condo ID as a variable and include it in search conditions!"),
    (r"// 🎯 필수: 이 콘도 ID를 먼저 제한해야 합니다\.", r"// 🎯 Required: MUST filter by this condo ID first."),
    (r'Alert\.alert\("Error", `Unit \$\{manualTargetUnit\}을\(를\) 찾을 수 없습니다\.`\);', r'Alert.alert("Error", `Unit ${manualTargetUnit} not found.`);'),
    (r"// 여기서 실제 UUID를 확보", r"// Obtain the actual UUID here"),
    (r"// 🎯 방문 일자\(오늘 날짜\) 자동 생성", r"// 🎯 Auto-generate visit date (today)"),
    (r"// 1\) visitor_passes에 PENDING 상태로 인서트 \(입주민 앱 승인 대기열에 노출하기 위함\)", r"// 1) Insert into visitor_passes with PENDING status (to expose to resident app's approval queue)"),
    (r"// 🎯 제약 조건에 있는 'OTHER' 사용", r"// 🎯 Use 'OTHER' as per constraints"),
    (r"// 🎯 경비원이 입력한 내용\(Grab Food 등\)을 여기로!", r"// 🎯 Put guard's input (Grab Food, etc.) here!"),
    (r"// 🎯 날짜를 반드시 넣어주세요!", r"// 🎯 Must include the date!"),
    (r"// 가드 앱에서 알림을 넣을 때, 입주민의 expo_push_token을 찾아서 함께 넣어야 합니다\.", r"// When inserting notifications from Guard app, find and include resident's expo_push_token."),
    (r"// 2\) 실제 UUID를 사용해 입주민에게 알림 발송", r"// 2) Send notification to resident using actual UUID"),
    (r"// 🎯 이 부분이 매우 중요합니다\. \(입주민이 알림을 받기 위해\)", r"// 🎯 This part is very important. (For resident to receive notification)"),
    (r"// 🎯 이 토큰이 있어야 푸시가 감!", r"// 🎯 This token is required for push!"),
    (r"// 3\) 승인 불필요: 즉시 APPROVED 상태로 visitor_passes 생성 후 로깅", r"// 3) Approval not required: create visitor_passes with APPROVED status immediately and log"),
    (r"// 🎯 경비원이 확인했으므로 바로 APPROVED", r"// 🎯 Guard verified, so set to APPROVED immediately"),
    (r"// 🎯 승인 불필요 로직에도 방문 일자 추가!", r"// 🎯 Add visit date even in logic where approval is not required!"),
    (r"// 🎯 \[Core Integration\] 가드 앱에서 방문자 승인/통과 처리 시", r"// 🎯 [Core Integration] When Guard App processes visitor approval/entry"),
    (r"// 로그 기록", r"// Log record"),
    (r"// QR 스캔 모드 활성화 \(기존 카메라 기능 활용\)", r"// Activate QR scan mode (using existing camera feature)"),
    (r"// 기존 서명 모달 실행", r"// Execute existing signature modal"),
    (r"// 3\. 인증 로직 분리 \(서명 완료 즉시 상태를 바꾸고 성공 알림을 띄우는 함수\)", r"// 3. Separate auth logic (function to change status immediately after signature and show success alert)"),
    (r"// 🎯 서버 업데이트 코드 추가!", r"// 🎯 Add server update code!"),
    (r"// 🔒 Proxy Token Match Check: 대리인 수령 시 소유주 패스코드 해시 크로스체크", r"// 🔒 Proxy Token Match Check: Cross-check owner's passcode hash when proxy receives"),
    (r"// 1\. 서명 패드에 강제로 서명 저장 명령 전송", r"// 1. Send force save signature command to signature pad"),
    (r"// 1\. QR 데이터가 JSON인지 확인 \(입주민 앱에서 생성한 데이터\)", r"// 1. Check if QR data is JSON (Data generated from resident app)"),
    (r"// 2\. 서명/이름 입력 없이 즉시 업데이트", r"// 2. Immediate update without signature/name input"),
    (r"// 🎯 추가: 로그 기록을 위한 정보 업데이트", r"// 🎯 Added: update info for log record"),
    (r"// 안전하게 'ARRIVED' 상태일 때만 처리", r"// Safely process only when status is 'ARRIVED'"),
    (r"// 2\. 가드 앱 내 활동 로그\(accessLogs\)에도 기록", r"// 2. Also record in Guard App's activity log (accessLogs)"),
    (r"// 리스트 즉시 갱신", r"// Refresh list immediately"),
    (r"// \(기존의 Visitor Pass 검증 로직 유지\)", r"// (Maintain existing Visitor Pass validation logic)"),
    (r"// 1\. 차량 번호판\(plate\)으로 vehicles 테이블에서 해당 차량의 unit_id를 조회", r"// 1. Query unit_id of the vehicle from vehicles table using plate"),
    (r"// 2\. 로그 업데이트", r"// 2. Log update"),
    (r"// 3\. 빌링 테이블로 즉시 전송", r"// 3. Send immediately to billing table"),
    (r"// 🎯 단계별 상태값 \(스캔 -> 동호수/사진 -> 최종 제출\)", r"// 🎯 Step-by-step status (Scan -> Unit/Photo -> Final Submit)"),
    (r"// 🎯 단계 표시 인디케이터", r"// 🎯 Step indicator"),
    (r"// 현재 단계 강조", r"// Highlight current step"),
    (r"// Unit 번호 입력 및 OCR 버튼", r"// Unit number input and OCR button"),
    (r"// 🎯 ✍️ \[일괄 묶음 사인이식 완전체 보안 모달 개조\]", r"// 🎯 ✍️ [Batch signature integrated security modal reform]"),
    (r"// 1단계: 이름 입력", r"// Step 1: Input name"),
    (r"// 2단계: 이름 입력 확인 후 서명 패드 노출", r"// Step 2: Show signature pad after confirming name input"),
    (r"// 🎯 여기서 명시적으로 상태 변경", r"// 🎯 Change status explicitly here"),
    (r'console\.log\("서명 캡처 성공, 상태 변경 완료"\);', r'console.log("Signature capture successful, status changed");'),
    (r"// 🎯 여기서 즉시 인증 로직 호출!", r"// 🎯 Call auth logic immediately here!"),
    (r'console\.log\("서명이 비어있음"\);', r'console.log("Signature is empty");'),
    (r"// 🎯 사진 촬영 안내 오버레이", r"// 🎯 Photo capture guide overlay"),
    (r"// DB에서 송장번호를 바탕으로 매핑된 유닛 검색", r"// Search for mapped unit based on tracking number in DB"),
    (r"// 매핑 실패 시 수동 입력을 위해 조용히 넘어감", r"// Silently pass for manual input if mapping fails"),
    (r"// 스캔 성공 시 검증 함수 호출", r"// Call validation function upon successful scan"),
    (r"// 🎯 스캔 가이드라인 오버레이", r"// 🎯 Scan guideline overlay"),
    (r"// 🎯 MY PAGE 탭", r"// 🎯 MY PAGE Tab"),
    (r"// 🎯 가드 모바일 레이아웃 전용 커스텀 스타일 스펙트럼", r"// 🎯 Custom style spectrum for guard mobile layout"),
    (r"// 🎯 새로 추가된 UI 스타일", r"// 🎯 Newly added UI style"),
    (r"// 현재 단계는 밝은 녹색으로 강조", r"// Current step is highlighted in bright green"),
    (r"\{/\* 🎯 단계 표시 인디케이터 \*/\}", r"{/* 🎯 Step indicator */}"),
    (r"\{/\* Unit 번호 입력 및 OCR 버튼 \*/\}", r"{/* Unit number input and OCR button */}"),
    (r"\{/\* 🎯 ✍️ \[일괄 묶음 사인이식 완전체 보안 모달 개조\] \*/\}", r"{/* 🎯 ✍️ [Batch signature integrated security modal reform] */}"),
    (r"\{/\* 1단계: 이름 입력 \*/\}", r"{/* Step 1: Input name */}"),
    (r"\{/\* 2단계: 이름 입력 확인 후 서명 패드 노출 \*/\}", r"{/* Step 2: Show signature pad after confirming name input */}"),
    (r"\{/\* 🎯 사진 촬영 안내 오버레이 \*/\}", r"{/* 🎯 Photo capture guide overlay */}"),
    (r"\{/\* 🎯 스캔 가이드라인 오버레이 \*/\}", r"{/* 🎯 Scan guideline overlay */}"),
    (r"\{/\* 🎯 MY PAGE 탭 \*/\}", r"{/* 🎯 MY PAGE Tab */}"),
]

for old, new_str in replacements:
    content = re.sub(old, new_str, content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Replacement complete.")
