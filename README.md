# 오래동물의료센터 직원관리 — 설치 가이드

출퇴근(병원 Wi-Fi에서만), 연차 신청·승인, 근무표·당직표를 관리하는 웹앱입니다.
직원은 휴대폰으로, 원장은 휴대폰이나 PC로 같은 주소에 접속합니다.

- 데이터 저장: **Supabase** (무료 플랜)
- 사이트 호스팅: **Vercel** (무료 플랜)
- 코드 보관: **GitHub** (Vercel에 올리는 통로)

처음 한 번 30분 정도 걸립니다. 순서대로 따라 하세요.

---

## 1단계. Supabase (데이터베이스)

1. https://supabase.com 에 가입하고 **New project**를 만듭니다.
   - Region: **Northeast Asia (Seoul)**
   - Database password는 아무 값이나 정하고 따로 적어 두세요.
2. 프로젝트가 만들어지면 왼쪽 메뉴 **SQL Editor**를 엽니다.
   이 폴더의 `supabase/schema.sql` 파일 내용을 전부 복사해 붙여넣고 **Run**을 누릅니다.
   "Success" 메시지가 나오면 됩니다.
3. 왼쪽 **Authentication → Sign In / Providers**(또는 Settings)에서
   **Allow new users to sign up** 를 **끕니다**. (아무나 가입하지 못하게)
4. **Authentication → Users → Add user → Create new user**로 원장님 첫 계정을 만듭니다.
   - Email: `원하는아이디@orae.staff` (예: `won1@orae.staff`)
   - Password: 8자 이상
   - **Auto Confirm User** 체크
   - 맨 처음 만든 계정이 자동으로 **원장(관리자)** 이 됩니다.
5. **Project Settings → API**(API Keys)에서 아래 3가지를 복사해 둡니다.
   - Project URL
   - `anon` `public` 키
   - `service_role` 키 ← **절대 다른 사람에게 보여주지 마세요**

## 2단계. GitHub (코드 올리기)

1. https://github.com 에 가입합니다.
2. 오른쪽 위 **+ → New repository**
   - 이름: `orae-staff`, **Private** 선택 → Create
3. 만들어진 페이지에서 **uploading an existing file** 링크를 누르고,
   이 폴더 안의 파일과 폴더(`api`, `public`, `supabase`, `package.json`, `README.md`)를 전부 끌어다 놓은 뒤 **Commit changes**.

## 3단계. Vercel (사이트 공개)

1. https://vercel.com 에서 **Continue with GitHub**로 가입합니다.
2. **Add New → Project** → `orae-staff` 저장소 **Import**
3. **Environment Variables**에 3개를 넣습니다 (이름은 정확히 그대로).

   | Name | Value |
   |---|---|
   | `SUPABASE_URL` | 1단계에서 복사한 Project URL |
   | `SUPABASE_ANON_KEY` | anon public 키 |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role 키 |

4. **Deploy**. 1~2분 뒤 `https://orae-staff-xxxx.vercel.app` 같은 주소가 생깁니다.
   (Settings → Domains에서 주소 이름을 바꿀 수 있어요)

## 4단계. 처음 설정 (원장님)

1. **병원 Wi-Fi에 연결된 휴대폰이나 PC로** 사이트에 접속해 원장 계정으로 로그인합니다.
   (아이디는 `@orae.staff` 앞부분만 입력, 예: `won1`)
2. **직원·설정** 탭
   - **출퇴근 허용 네트워크 → 지금 네트워크 등록**: 이걸 해야 출근 체크가 됩니다.
   - **연차 규정**: 병원 규정을 정하고 저장
   - **직원 추가**: 공동대표 원장님(권한: 원장, **근로자 체크 해제**), 테크니션 두 분(입사일 꼭 입력)
3. 직원에게 사이트 주소, 아이디, 처음 비밀번호를 알려 줍니다.

## 5단계. 직원 휴대폰에 앱처럼 설치

- **아이폰**: Safari로 접속 → 공유 버튼 → **홈 화면에 추가**
- **안드로이드**: Chrome으로 접속 → 오른쪽 위 ⋮ → **홈 화면에 추가**(앱 설치)

---

## 기능 요약

| 화면 | 직원 | 원장 |
|---|---|---|
| 출퇴근 | 병원 Wi-Fi에서만 출근/퇴근 버튼 작동, 최근 기록 | 같음 |
| 연차 | 잔여 확인, 연차/오전·오후 반차 신청, 대기 중 취소 | 같음 |
| 근무표 | 주간 근무·당직·연차 보기 | 칸을 눌러 정규/야간당직/주말당직/휴무 지정, 지난주 복사 |
| 관리 | — | 오늘 출퇴근 현황, 연차 승인/반려(겹치는 직원·잔여 부족 경고), 월별 기록 수정·추가, 엑셀(CSV) 받기 |
| 직원·설정 | — | 직원 계정 생성·수정·퇴사 처리, 비밀번호 변경, 연차 가감, 연차 규정, 허용 네트워크 |

## 연차 규정이 적용되는 방식

- 원장님이 **병원 자체 규정**(연간 일수, 1년 미만 월 1일 여부, 근속 가산 여부)을 정할 수 있습니다.
- **근로자(대표 제외, 재직 중)가 5명 이상이 되면 자동으로 근로기준법 기준**으로 계산됩니다.
  - 1년 미만: 한 달 근무마다 1일 (최대 11일)
  - 1년 이상: 15일, 3년차부터 2년마다 1일 추가, 최대 25일
- 연차 기간은 각 직원 **입사일 기준 1년 단위**입니다.
- 참고: 법의 "상시 근로자 수"는 한 달 평균 인원으로 따지고, 연차에는 출근율 80% 요건도 있습니다.
  앱은 현재 재직 인원으로 단순 계산하니, 경계에 있을 때는 노무사 확인을 권합니다.

## 출퇴근 Wi-Fi 확인 방식

휴대폰 브라우저는 Wi-Fi 이름을 읽을 수 없어서, 서버가 **접속한 인터넷 주소(공인 IP)가 병원 고정 IP인지** 확인합니다.
직원이 이 주소를 위조할 수 없고, 출퇴근 기록은 서버만 쓸 수 있습니다(직원이 직접 수정 불가).

- 병원 Wi-Fi인데도 "병원 Wi-Fi가 아니에요"가 뜨면: 원장님이 그 상태에서 **지금 네트워크 등록**을 한 번 더 누르세요.
  일부 통신망은 IPv6 주소(`2001:...`)로 접속하는데, 이때는 직접 입력란에 `2001:abcd:1234:5678:*` 처럼 앞 네 덩어리 + `*` 로 등록하면 됩니다.
- 원장님이 수정한 기록에는 수정자와 사유가 남습니다.

## 자주 묻는 것

- **비밀번호를 잊었어요** → 원장님이 직원·설정에서 "비번 변경"
- **퇴사자** → 직원·설정에서 "재직" 체크 해제 후 저장 (기록은 남고 로그인만 막힘)
- **Supabase 무료 플랜**은 일주일 넘게 아무도 접속하지 않으면 잠시 멈춥니다. 매일 쓰면 문제없고, 멈추면 Supabase 대시보드에서 Restore를 누르면 됩니다.
- **코드 수정 후 반영** → GitHub 저장소에 파일을 다시 올리면 Vercel이 자동으로 새로 배포합니다.

## 폴더 구성

```
api/            서버 기능 (Vercel이 자동 실행)
  clock.js      출퇴근 + Wi-Fi(IP) 확인
  users.js      직원 계정 생성·비밀번호 변경 (원장 전용)
  config.js     화면용 공개 설정
  _lib.js       공용 함수
public/         화면
  index.html, app.js, leave.js(연차 계산), style.css, manifest.json, 아이콘
supabase/
  schema.sql    데이터베이스 + 보안 규칙
package.json
```
