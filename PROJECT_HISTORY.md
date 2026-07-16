# 🏢 FiliHomes Project Development History

## 📌 Project Overview
- **목표:** 필리핀 현지 빌리지, Subdivision 및 타운하우스 단지(100~300세대 규모)를 대상으로 유지보수, 수납(세대당 20페소 과금), 보안, 제휴 비즈니스를 통합하는 "초연결 PropTech 주거 관리 솔루션" 구축.
- **주요 기술 스택:**
  - **Frontend (Mobile):** React Native (Expo), AsyncStorage (Offline-first)
  - **Frontend (Web/PWA):** Next.js, React
  - **Backend (BaaS):** Supabase (PostgreSQL, Auth, Storage, Edge Functions, Realtime, pg_cron)
- **아키텍처 특징:** 하나의 앱으로 수백 개 단지(Village/Subdivision)를 서비스하는 **완벽한 멀티테넌시(Multi-tenancy)** 및 **서버 주도형 동적 UI(Server-Driven UI)** 채택.

---

## ✅ Completed Phases & Features

### [Phase 1] 데이터 아키텍처 및 기본 인증 인프라 (완료)
- **DB 스키마 & RLS:** `condos`, `units`, `profiles`, `user_units`(브릿지 테이블), `billings` 구축 완료. 철저한 Row Level Security(RLS) 격리 적용.
- **세션 관리:** `AsyncStorage`를 활용한 JWT 토큰 로컬 캐싱 및 최초 로그인 시 임시 비밀번호 강제 변경 로직 (`useAuth.ts`, `supabase.ts`).

### [Phase 2] 모바일 앱 동적 UI 및 수동 결제 워크플로우 (완료)
- **동적 UI 엔진:** 콘도별로 테마 색상과 메뉴(Features)를 다르게 렌더링하는 `CondoConfigContext.tsx`.
- **멀티 유닛 스위처:** 여러 호수를 소유한 사용자를 위해 전역 상태를 교체하는 `UnitContext.tsx`, `UnitSwitcherBar.tsx`.
- **오프라인 우선(Offline-First):** 인터넷 음영지역 대비 로컬 캐싱 로직 (`billingService.ts`, `BillingScreen.tsx`).
- **수동 결제(영수증 검증):** `expo-image-picker`를 활용한 영수증 스토리지 업로드 (`ReceiptUploader.tsx`) 및 관리자 승인 로직 (`payment.ts`).

### [Phase 3] 게이트 하우스 연동 및 실시간 출입 제어 시스템 (완료)
- **게스트 QR 패스 생성:** 유효기간이 설정된 QR 코드를 생성하고 PWA 웹 뷰어 링크를 공유 (`GuestPassGenerator.tsx`).
- **PWA 보안 웹 뷰어:** 캡처 방지용 실시간 시계와 QR 코드가 포함된 방문객용 반응형 웹 (`[pass_code].tsx`).
- **실시간 인터폰(웹소켓):** QR이 없는 방문객을 위해 가드 태블릿(`GuardScanner.tsx`)에서 입주민 앱(`LiveGateIntercom.tsx`)으로 `Supabase Realtime` 승인 요청 팝업 전송.
- **계정 권한 자동 회수 (pg_cron):** 매일 자정에 만료된 세입자나 90일 연체된 RTO 계정을 `inactive`/`suspended` 처리하는 스케줄러 SQL 적용 및 앱 진입 차단 가드 (`AppGuardInterceptor.tsx`).

### [Phase 4] PG사 API 연동 및 외부 생태계 확장 (완료)
- **PG 다중 API 키 라우팅:** 보안을 위해 `condo_gateways` 테이블에 키를 격리하고, `Supabase Edge Function (payment-gateway)`으로 Xendit/PayMongo 결제 링크 동적 생성 (`DigitalPaymentButton.tsx`).
- **유지보수(Job Order) 티켓:** 입주민의 고장 사진 접수(`JobOrderRequest.tsx`) 및 관리자 배정/자재비 정산 백엔드 로직 (`jobOrder.ts`).
- **연체료/정원 예약 시스템:** 매달 말일 미납자 연체료 자동 가산 `pg_cron` 등록 및 동시성 처리가 된 시설 예약 컴포넌트 (`AmenityBooker.tsx`).
- **슈퍼 앱 생태계 (HeyDriver/PhiliSpa):** 유저 식별 데이터를 포함한 딥링크 라우팅 위젯 (`EcosystemWidget.tsx`) 및 PWA 게스트 웰컴 프로모션 배너 (`GuestPassAdBanner.tsx`).

### [Phase 5] 모바일 앱 홈 화면(대시보드) UI/UX 고도화 (완료)
- **입주민 홈 화면 위젯 배치 기획 및 구현:** 기획서를 바탕으로 5가지 섹션(최상단 헤더 스위처, 프리미엄 롤링 배너, 핵심 주거 행정 퀵 메뉴, 독점 제휴 영역, 소상공인 타겟팅 광고 피드)으로 구성된 `HomeScreen.tsx` 프론트엔드 마크업 완료.
- **Server-Driven UI 연동:** `CondoConfigContext`의 `themeColor`를 활용하여 콘도별 동적 테마를 UI 요소(전화 걸기 버튼 등)에 유연하게 적용.
- **컴포넌트 통합:** 기존에 구현한 `EcosystemWidget` 등을 홈 화면에 통합하여 앱의 진입점(Entry Point) 역할 수행 강화.

### [Phase 6] 모바일 앱 종합 네비게이션, 커뮤니티/바자 스크린 및 스태프 모드 확장 (완료)
- **하단 탭 네비게이션(Bottom Tabs):** `App.tsx`에 `createBottomTabNavigator`를 도입하여 홈(Home), 커뮤니티(Community), 바자(Bazaar), 마이페이지(My Page)로 이어지는 글로벌 내비게이션 구축.
- **안드로이드 뒤로가기 방어(Android Back Guard):** 안드로이드 하드웨어 백 버튼 클릭 시 실수로 앱이 종료되는 것을 방지하는 `AndroidBackGuard` 모듈 추가.
- **통합 권한 온보딩:** 로그인 직후 앱 구동에 필요한 필수 시스템 권한을 획득하는 `PermissionScreen.tsx` 연결.
- **커뮤니티 및 바자(중고거래) 기능:** 입주민 간 소통을 위한 `CommunityScreen.tsx` 및 중고거래 피드(`BazaarScreen.tsx`), 상세(`BazaarDetail.tsx`), 실시간 채팅(`BazaarChatScreen.tsx`) 추가.
- **필리 스태프(가드/관리자) 전용 모드:** 비인증 상태에서 스태프 계정으로 접속할 수 있는 숨겨진 진입점(`FiliStaffSecretDoor.tsx`)과 역할별 전용 스크린(`FiliStaffAdminMain.tsx`, `FiliStaffGuardMain.tsx`) 라우터 등록 완료.
- **주민 편의 메뉴 컴포넌트 확장:** 공지사항(`NoticeList.tsx`), 방문자 관리(`VisitorManageScreen.tsx`), 유지보수(`MaintenanceScreen.tsx`), 시설예약(`AmenityScreen.tsx`), 인터폰채팅(`IntercomChatScreen.tsx`), 택배배송(`ParcelDelivery.tsx`), 차량관리(`VehicleManage.tsx`), 마이페이지(`MyPageScreen.tsx`) 스크린 파일 생성 및 Stack Navigator 에 일괄 등록.

### [Phase 7] 어드민 통합 관제 백오피스 웹 및 레거시 데이터 마이그레이션 (완료)
- **레거시 엑셀 인젝션 파이프라인 (`DataMigrator.tsx`):** 구형 수기 CSV 장부를 웹 브라우저에서 런타임 파싱 후 무결성 가드(호실 번호 오타, 페소 기호 오염 등)를 거쳐 `billings` 테이블로 `bulk insert` 쳐주는 가속화 게이트웨이 구현 완료.
- **실시간 중앙 통신 관제 매트릭스 (`RealtimeIntercomMatrix.tsx`):** 가드 앱의 수동 입차 요청 및 초긴급 SOS 사이렌 플래그를 `Supabase Realtime (웹소켓)` 채널로 초당 수신하고 원격 개방(Approve/Deny)을 처리하는 삼각 관제 시스템 이식 완착.
- **가드 근태 연동 페이롤 엔진 (`StaffPayrollManager.tsx`):** 필리핀 노동법 단가(기본 8시간 외 초과 OT 125% 가산 공식)를 인라인 인젝션하여 가드들의 누적 타임카드를 세전/세후 피소(₱)로 정산하는 자동화 장치 장착.
- **유지보수 자재비 고지서 연동 보드 (`MaintenanceJobOrderManager.tsx`):** 거주자가 접수한 수리 내역 티켓에 기술자 공임비와 부품 자재비를 정산하는 즉시, 다음 달 관리비 고지서 원장 테이블로 연동·합산해버리는 상용 비즈니스 자동화 로직 완착.

### [Phase 8] 유지보수 워크플로우 및 종합 어드민 웹/모바일 확장 (완료)
- **유지보수 기술자 전용 앱 (`MaintenanceTechApp.tsx`):** 작업 확인(JOBS), 현장 보고서(REPORT), 이력(HISTORY) 외에도 스태프 간 무전기 통신(`RadioModule.tsx`), 교대 근무 관리(`ShiftModule.tsx`) 모듈 연동.
- **Job Order 시간 조율 및 워크플로우 DB 확장:** 기사 방문 시간 조율 기능(Time Negotiation)과 사진 업로드, 자재비 청구를 위한 DB 스키마 업데이트 (`update_job_orders_for_tech_workflow.sql`, `add_time_negotiation_to_job_orders.sql`).
- **모바일 통합 스태프 대시보드 (`AdminDashboard.tsx`):** 가드의 택배 스캔/등록 및 PMO의 Job Order 티켓 관리 등을 모바일 뷰로 일원화.
- **백오피스 어드민 웹 고도화 (Admin Web UI):**
  - 청구서 및 영수증 승인 관리 (`BillingManager.tsx`)
  - 택배 입출고 및 Audit Log 추적 (`ParcelManager.tsx`)
  - 입주민 차량/주차 등록 관리 (`VehicleRegistryManager.tsx`)
  - 보안 제재 및 신고 접수 처리 (`SecuritySanctionManager.tsx`)
  - 콘도별 동적 설정(연체료, 기본 주차비 등) 관리 (`CondoSettings.tsx`)

---

## 📂 Directory Structure (Core Files)
- **`/mobile-app/` (Expo App)**
  - `hooks/`: `useAuth.ts`, `UnitContext.tsx`, `CondoConfigContext.tsx`
  - `components/`: `UnitSwitcherBar.tsx`, `ReceiptUploader.tsx`, `LiveGateIntercom.tsx`, `GuardScanner.tsx`, `EcosystemWidget.tsx`, `AppGuardInterceptor.tsx`, `JobOrderRequest.tsx`, `AmenityBooker.tsx`, `shared/RadioModule.tsx`, `shared/ShiftModule.tsx`
  - `services/`: `billingService.ts` (Offline caching)
  - `screens/`: `HomeScreen.tsx`, `BillingScreen.tsx`, `MaintenanceTechApp.tsx`, `AdminDashboard.tsx`, 등 다수의 화면 파일
  - `lib/`: `supabase.ts` (AsyncStorage Init)
- **`/admin-web/` (Next.js)**
  - `pages/view/[pass_code].tsx`: Guest QR PWA Viewer
  - `components/`: `GuestPassAdBanner.tsx`, `BillingManager.tsx`, `CondoSettings.tsx`, `ParcelManager.tsx`, `SecuritySanctionManager.tsx`, `VehicleRegistryManager.tsx`, `DataMigrator.tsx`, `RealtimeIntercomMatrix.tsx`, 등 관리자 컴포넌트
  - `utils/`: `payment.ts`, `jobOrder.ts`
- **`/supabase/` (Backend & SQL Scripts)**
  - `functions/payment-gateway/index.ts`: PG Edge Function
  - `migrations/` & Root SQLs: DB Schema, RLS, `pg_cron` Scripts, Job Order Workflow Updates (`20240521*.sql`)

---

## 🚀 Next Steps / Current Status
- **최근 업데이트 (2026-06-21):**
  - **Resident Service Hub 그리드 재정렬:** 홈 화면의 서비스 허브 메뉴를 사용자 요청 순서(Visitor, Job Order, Community, Notices, Amenities, Bazaar)에 맞춰 6개 그리드로 재배치하고, Support Chat 항목을 그리드에서 제외함.
  - **Messages 탭 구조 고도화:** 하단 Messages 탭(`DirectChatListScreen`)에 진입 시, **Support Chat**(로비 가드/PMO 오피스 연결) 영역과 **1:1 Chatting**(입주민 간 개인 채팅) 영역을 섹션으로 나누어 명확하게 인지할 수 있도록 레이아웃을 개편하고 각 진입 링크를 연결함.
  - **테마 통일 및 필리핀 국기 색상 도입:** 앱명 "FiliHomes"의 상징성을 살려 기본 테마 컬러를 필리핀 국기 청색인 **Phili Blue(`#0038a8`)**로 전격 통일했습니다. 또한 사용자의 선호에 따라 전체 배경, 액센트(강조 선, 탭 활성화 바) 등 기본 테마 색상은 Phili Blue로 단일화하여 깔끔함을 유지하고, 실시간 알림 카운터, 미수령 우편함 알림 뱃지, 연체 고지 등 **뱃지 컨트롤 색상만 필리핀 국기의 빨간색(`#ce1126`)**으로 통일 적용하여 극적인 대비 효과와 시각적 명확성을 주었습니다. 마지막으로 개발 단계의 레이아웃 및 컬러 테마 선택 스위처 바를 홈 화면에서 완전히 제거하여 프로덕션 배포용의 정돈된 화면을 구축했습니다.
  - **하단 탭 바 정리 (Community & Bazaar 제거):** 홈 화면의 서비스 허브에 Community와 Bazaar 메뉴가 이미 탑재되어 있으므로, 하단 탭 바에서 해당 탭들을 완전히 제거하여 3개 탭(Home, Messages, My Page) 체제로 간소화하였습니다. 이를 위해 두 화면을 Stack.Navigator로 이관하고, 관련 디테일 화면들의 이동 경로를 Stack Screen 대상으로 직접 정렬했습니다.
  - **Support Chat 뒤로가기 탐색 오류 수정 및 카드 UI 고도화:** Messages 탭에서 로비 가드 및 PMO 오피스 다이렉트 채팅으로 바로 진입한 후 뒤로가기 버튼을 누를 때 인터폰 부서 선택 Gateway 스크린(`ROUTING_GATE`)에 가두어지던 탐색 버그를 수정하여 곧장 Messages 탭으로 복귀하게 하였습니다. 또한 Messages 탭 내 Support Chat 리스트의 형태를 인터폰 스크린의 고도화된 대형 카드 스타일(이모지, 전용 태그, 상세 안내)과 100% 동일하게 맞춰 프리미엄 디자인 일관성을 높였습니다.
- MVP 및 코어 비즈니스 로직(100 Credits 분량) 100% 설계 및 코드 작성 완료.
- **향후 진행 시:** 배포 준비(환경변수 세팅), UI/UX 디자인 다듬기, 어드민 대시보드(웹) 상세 페이지 구현, 실 기기 테스트 단계 도입 필요.

## 🚨 DEPLOYMENT CHECKLIST: Launch day setup -> Run RLS Security SQL script in Supabase.