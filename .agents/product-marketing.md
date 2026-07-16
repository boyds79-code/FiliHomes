# Product Marketing Context

*Last updated: 2026-07-05*

## Product Overview
**One-liner:**
필리핀 콘도미니엄 시장을 위한 AI 기반 올인원 주거 행정 및 경비원 관리 플랫폼

**What it does:**
FiliHomes는 관리비 고지서 자동 발행, 모바일 수납 및 AI 영수증 검증 대조를 통해 PMO(Property Management Office)의 관리비 수금 프로세스를 자동화합니다. 또한 가드의 근태 관리와 실시간 입차 QR 패스, 택배 알림, 유지보수 자재비 합산 청구 등 아파트 단지 운영 전반을 모바일 앱과 어드민 웹으로 연결하는 솔루션입니다.

**Product category:**
Property Management Software (PMS), PropTech, B2B SaaS

**Product type:**
B2B2C SaaS (PMO/HOA Board 대상 B2B 구독 모델 + 입주민/가드/기사용 모바일 앱)

**Business model:**
* **B2B SaaS 구독**: 세대당 월 20 PHP (100~300세대 규모 빌리지 및 Subdivision 타겟)
* **제휴 수수료 & 커뮤니티 광고**: 홈 화면 배너 광고 및 입주민 제휴 홈케어 서비스 연계 수수료

---

## Target Audience
**Target companies:**
* 필리핀 내 100~300세대 규모의 빌리지 및 Subdivision (단독주택/빌라 군집) 관리 사무소 및 입주민 대표회 (Homeowners Association (HOA))
* 독립 부동산 관리 대행업체 (Property Management Agencies)
* 자체 IT 인프라가 낙후된 중저가형 타운십 및 주거 단지

**Decision-makers:**
* HOA 이사회 멤버 (HOA Board Members / Homeowners Association President)
* 자산/단지 관리소장 (Property Manager / PMO Head)

**Primary use case:**
관리비 미수금 회수율 극대화 및 경비원·용역 근태 불량으로 인한 인건비 누수 방지

**Jobs to be done:**
1. 매달 종이로 인쇄해 배부하던 고지서와 GCash 수동 대조 작업을 디지털화하여 업무 시간을 단축하고 금융 사고를 방지하고 싶다.
2. 경비원들이 제시간에 순찰을 도는지 확인하고, 필리핀 노동법에 따른 초과 수당(OT)과 교대 근무 관리를 누수 없이 자동으로 정산하고 싶다.
3. 방문 차량과 택배 배송 이력을 투명하게 기록하고, 미수금 연체 세입자의 출입을 효과적으로 제재하고 싶다.

**Use cases:**
* 고지서 대량 자동 인쇄 및 모바일 리마인더 발송
* 경비실 실시간 QR 게이트 패스 발급 및 실시간 인터폰 호출
* 가드 체크인 근태 타임카드를 연동한 급여(Payroll) 자동 가산 정산
* 수기 엑셀 장부의 원클릭 시스템 이전

---

## Personas
| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| **Property Manager (PM)** | 업무 효율성, 민원 최소화, 관리 보고서 작성 | 매일 반복되는 수기 수금 대조 업무와 경비원들의 근태 문제 및 잦은 이직에 시달림 | 엑셀 수동 대조 85% 감소, 용역 근태 모니터링 원클릭 시각화 |
| **Condo Board (소유주 대표)** | 미수금 회수율, 건물 관리 예산 방어 (OPEX 절감) | 연체율이 높아 건물 유지보수 자금이 부족하나, 연체 세입자를 강제 퇴거/제재하기 까다로움 | 미납 90일 연체 세입자 모바일 앱 권한 및 출입 QR 코드 자동 차단 |
| **Lobby/Gate Guard (경비원)** | 간편한 출입 대조, 교대 근무 승인 | 매번 일일이 종이 장부에 수기로 방문 차량 정보를 적어야 하고 교대 근무 정산이 꼬임 | 태블릿 카메라 QR 스캔만으로 실시간 입출차 처리 및 로컬 타임카드 기록 |

---

## Problems & Pain Points
**Core problem:**
필리핀 주거 관리 현장의 높은 수기 장부 의존성으로 인한 회계 투명성 저하 및 비효율적인 용역 근태 통제력 부재

**Why alternatives fall short:**
* **엑셀/수기 장부**: 인적 오류(Human Error)가 빈번하고 결제 영수증 위조 사기(Fake GCash screenshots)를 잡아내지 못합니다.
* **대형 해외 PMS (Yardi, RealPage 등)**: 연 수천만 원이 넘는 비용이 들어 중소형 콘도는 도입이 불가능하며, 필리핀 현지 결제(GCash, Maya) 및 로컬 노동법 급여 연동이 전혀 지원되지 않습니다.
* **로컬 경쟁사 (Collo 등)**: 입주민 편의와 기본적인 모바일 납부 기능에 치중되어 있어, PMO의 진짜 페인포인트인 '용역 근태 불량에 의한 인건비 누수' 및 '지하 주차장 인터넷 통신 음영 지연 문제'를 해결하지 못합니다.

**What it costs them:**
* 매월 수금 불일치 및 미수금 누적으로 인한 연간 수십만 페소의 재정 손실
* 부정 출근 및 가짜 근무 기록으로 인한 용역비 중복 지불

**Emotional tension:**
"세입자는 돈을 안 내고, 경비원은 근무태만인데, 법적으로 강제 퇴거는 어렵고 관리비 펑크는 계속 나니 미칠 지경입니다." (관리소장의 스트레스)

---

## Competitive Landscape
**Direct:** **Collo (collo.ph)** — 결제 자동화 및 입주민 게이트 패스 기능을 구현한 로컬 대표 PropTech. 단, 경비원 관리 및 수기 데이터 이관 툴, 연체자 강제 차단 가드는 미흡합니다.
**Secondary:** **Inventi (inventi.asia)** — 대형 건물 타겟의 엔터프라이즈 솔루션. 단가가 높아 중소형 콘도에서 도입하기엔 가격 장벽이 높습니다.
**Indirect:** **Excel & Viber Groups** — 수십 년간 사용되어 온 무료 솔루션. 변화를 싫어하는 보수적인 보드 멤버들이 관성적으로 선호합니다.

---

## Differentiation
**Key differentiators:**
* **가드 근태 및 페이롤 자동화 엔진 ([StaffPayrollManager.tsx](file:///Users/chriskim/Documents/FiliHomes/admin-web/components/StaffPayrollManager.tsx))**: 필리핀 노동법 기준의 125% 초과근무 수당 정산 연동.
* **초고속 데이터 마이그레이션 도구 ([DataMigrator.tsx](file:///Users/chriskim/Documents/FiliHomes/admin-web/components/DataMigrator.tsx))**: 엉망인 기존 엑셀 장부를 시스템에 즉시 이관.
* **자동 체납 제재 시스템 ([AppGuardInterceptor.tsx](file:///Users/chriskim/Documents/FiliHomes/mobile-app/components/AppGuardInterceptor.tsx))**: 장기 연체 계정의 앱 권한 및 QR 게이트 이용 자동 차단.
* **인터넷 음영 지역용 오프라인 우선(Offline-First) 설계**: 주차장 등 통신 불량 지역에서도 무중단 입출차 QR 스캔 지원.

**How we do it differently:**
단순히 "입주민이 쓰기 편한 예쁜 앱"이 아닌, **"관리사무소의 실질적 비용과 수금을 즉시 통제하는 든든한 백오피스 파트너"**로 접근합니다.

**Why that's better:**
PMO의 인건비 누수를 즉시 잡고 세입자 수금율을 개선함으로써 플랫폼 도입 비용 대비 수배 이상의 재정적 이득을 PMO에 직접 돌려줍니다.

**Why customers choose us:**
기존 시스템 도입 시 우려하던 "엑셀 데이터 입력의 번거로움", "인터넷 끊김 걱정", "경비원 교육의 한계"를 완벽하게 방어해주기 때문입니다.

---

## Objections
| Objection | Response |
|-----------|----------|
| **"직원들이 디지털 앱 사용을 어려워합니다."** | 가드는 스마트폰 QR 스캔 버튼 하나만 누르면 작동하도록 UI를 극도로 단순화했고, 수기 엑셀 장부는 저희 마이그레이션 엔진을 통해 1분 만에 자동으로 입력됩니다. |
| **"지하 주차장이나 로비에 인터넷이 잘 안 터집니다."** | FiliHomes는 오프라인 로컬 캐시 기술을 내장하여 인터넷이 완전히 끊겨도 입출차 패스가 멈춤 없이 작동합니다. |
| **"도입 비용이 부담스럽습니다."** | 도입 직후 미수금 회수율이 평균 30% 개선되고 경비원 초과수당 오기입으로 누수되던 인건비가 즉시 정산되므로, 구독료 이상의 지출 절감 효과를 체감하실 수 있습니다. |

**Anti-persona:**
자체 IT 개발팀이 존재하고 전용 ERP를 가동 중인 Ayala/Megaworld 직영의 초호화 메이저 타운십 콘도미니엄. (이들은 엔터프라이즈 커스텀 솔루션을 개발해 사용하므로 비즈니스 핏에 맞지 않음)

---

## Switching Dynamics
**Push:** 수동 장부 정리와 GCash 영수증 수동 확인으로 매달 야근하는 스트레스, 연체 세입자에 대한 통제력 상실.
**Pull:** 고지서 원클릭 발행, 실시간 회계 정산 투명성, 용역 인건비 누수 방지.
**Habit:** "그냥 예전처럼 엑셀 쓰고 메신저 단톡방으로 공지 띄우는 게 손에 익어서 편해"라는 관성.
**Anxiety:** 신규 시스템 도입 시 데이터 유실 걱정, 모바일 데이터 장애 발생 시 입출차 마비 우려.

---

## Customer Language
**How they describe the problem:**
* "경비원들이 근무 시간에 자리를 비우거나, 근무 시간을 속여서 초과 수당을 청구해도 실질적으로 교차 검증할 수단이 없습니다."
* "입주민들이 GCash 영수증 스크린샷만 띡 보내주는데, 이게 진짜 입금된 건지 일일이 은행 내역이랑 맞춰보는 데만 며칠이 걸립니다."
* "체납자 방에서 시설 예약이나 게이트 출입을 못 하도록 페널티를 주고 싶은데, 일일이 경비실에 종이로 적어서 전달하니 제대로 이행이 안 됩니다."

**Words to use:**
수금율 개선, 인건비 누수 방지, 원클릭 이관, 무중단 게이트, 자동 연체 통제

**Words to avoid:**
최첨단 AI PropTech, 미래형 주거 에코시스템 (현지 PMO 관리자에게는 지나치게 추상적이고 신뢰감을 주지 못함)

---

## Brand Voice
**Tone:** 신뢰할 수 있는 (Reliable), 철저하고 투명한 (Transparent & Secure), 실용적인 (Practical)
**Style:** 직관적인 가이드 중심의 대화형 스타일, 기술적 난해함 배제
**Personality:** 필리핀 주거 현실과 관리소장의 외로운 업무 고충을 깊이 이해하는 조력자

---

## Proof Points
**Metrics:**
* **85%**: AI 및 자동화 매칭을 통한 수동 수납 대조 시간 감소
* **30%**: 미수금 수금 속도 향상 (자동 모바일 리마인더 발송 효과)
* **80%**: 파일럿 단지 내 입주민들의 월간 활성 모바일 앱 이용률

---

## Goals
**Business goal:** 필리핀 마닐라(BGC, Makati, Ortigas) 내 독립형/중소형 콘도 단지 20개 타워 우선 수주 (1년 차 ARR 212만 PHP 목표)
**Conversion action:** 무료 체험 신청 및 엑셀 장부 마이그레이션 시연 신청 (Demo Request)
