// ODsay 원본 노선 라벨("수도권 1호선", "경기 광역버스") → 표시/매칭용 정규화("1호선")
// "수도권 " / "경기 " 같은 지역 접두사(공백 포함)만 제거. "수인분당선"·"신분당선" 등 공백 없는 이름은 보존.
export function normalizeSubwayLineName(label: string): string {
  return label.replace(/^(수도권|경기|인천|부산|대구|광주|대전)\s+/, '')
}

// 지하철 API lineName 코드("1002") → 호선 이름("2호선")
export const subwayApiCodeToLineName = (lineName: string): string => {
  const map: Record<string, string> = {
    '1001': '1호선', '1002': '2호선', '1003': '3호선', '1004': '4호선',
    '1005': '5호선', '1006': '6호선', '1007': '7호선', '1008': '8호선', '1009': '9호선',
    '1071': '신분당선', '1063': '경의중앙선', '1075': '수인분당선',
    '1065': '공항철도', '1067': '경강선', '1077': '신림선',
  }
  return map[lineName] ?? lineName
}

// 서울 BIS busRouteType → ODsay busType 코드로 변환 (코드 체계가 다름)
export function seoulBisTypeToOdsayBusType(t: number | null | undefined): number | null {
  if (t == null) return null
  const map: Record<number, number> = {
    1: 5,   // 공항 → 공항
    2: 3,   // 마을버스 → 마을
    3: 11,  // 간선버스 → 간선
    4: 12,  // 지선버스 → 지선
    5: 13,  // 순환버스 → 순환
    6: 14,  // 광역버스 → 광역
    7: 10,  // 인천버스 → 외곽
    8: 8,   // 경기버스 → 경기
    11: 2,  // 좌석버스 → 좌석
    12: 1,  // 일반버스 → 일반
    13: 4,  // 직행좌석 → 직행
  }
  return map[t] ?? null
}

// ODsay busType 코드 → 색상 (busType이 null이면 번호 기반 추론으로 fallback)
export const getBusTypeByOdsay = (
  busType: number | null | undefined,
  fallbackBusNumber: string,
): { type: string; color: string; bgColor: string; label: string } => {
  const map: Record<number, { type: string; color: string; bgColor: string; label: string }> = {
    1:  { type: 'general',   color: '#65A30D', bgColor: '#ECFCCB', label: '일반' },
    2:  { type: 'seated',    color: '#7C3AED', bgColor: '#EDE9FE', label: '좌석' },
    3:  { type: 'village',   color: '#65A30D', bgColor: '#ECFCCB', label: '마을' },
    4:  { type: 'express',   color: '#DC2626', bgColor: '#FEE2E2', label: '직행' },
    5:  { type: 'airport',   color: '#4B5563', bgColor: '#F3F4F6', label: '공항' },
    6:  { type: 'trunk-exp', color: '#1D4ED8', bgColor: '#DBEAFE', label: '간선급행' },
    8:  { type: 'gyeonggi',  color: '#0891B2', bgColor: '#CFFAFE', label: '경기' },
    10: { type: 'outer',     color: '#6B7280', bgColor: '#F3F4F6', label: '외곽' },
    11: { type: 'trunk',     color: '#2563EB', bgColor: '#DBEAFE', label: '간선' },
    12: { type: 'branch',    color: '#16A34A', bgColor: '#DCFCE7', label: '지선' },
    13: { type: 'circular',  color: '#CA8A04', bgColor: '#FEF9C3', label: '순환' },
    14: { type: 'metro',     color: '#DC2626', bgColor: '#FEE2E2', label: '광역' },
    15: { type: 'rapid',     color: '#DC2626', bgColor: '#FEE2E2', label: '급행' },
    16: { type: 'tour',      color: '#6B7280', bgColor: '#F3F4F6', label: '관광' },
    20: { type: 'rural',     color: '#65A30D', bgColor: '#ECFCCB', label: '농어촌' },
    22: { type: 'gyeonggi',  color: '#0891B2', bgColor: '#CFFAFE', label: '경기' },
    26: { type: 'rapid-trunk', color: '#1D4ED8', bgColor: '#DBEAFE', label: '급행간선' },
    30: { type: 'hangang',   color: '#0891B2', bgColor: '#CFFAFE', label: '한강' },
  }
  if (busType != null && map[busType]) return map[busType]
  return getBusType(fallbackBusNumber)
}

// 버스 노선 타입 구분 (번호 기반 추론 — busType 있으면 getBusTypeByOdsay 우선)
export const getBusType = (busNumber: string): {
  type: string;
  color: string;
  bgColor: string;
  label: string;
} => {
  const num = busNumber.replace(/[^0-9]/g, '');

  // M버스 (광역급행)
  if (busNumber.startsWith('M')) {
    return { type: 'metro', color: '#DC2626', bgColor: '#FEE2E2', label: '광역' };
  }

  // N버스 (심야급행)
  if (busNumber.startsWith('N')) {
    return { type: 'rapid', color: '#DC2626', bgColor: '#FEE2E2', label: '급행' };
  }

  // 공항버스: 60xx 4자리
  if (num.length === 4 && num.startsWith('60')) {
    return { type: 'airport', color: '#4B5563', bgColor: '#F3F4F6', label: '공항' };
  }

  // 4자리 광역버스: 9xxx, 1xxx
  if (num.length === 4 && (num.startsWith('9') || num.startsWith('1'))) {
    return { type: 'metro', color: '#DC2626', bgColor: '#FEE2E2', label: '광역' };
  }

  // 4자리 직행좌석: 2xxx~4xxx (경기)
  if (num.length === 4 && (num.startsWith('2') || num.startsWith('3') || num.startsWith('4'))) {
    return { type: 'express', color: '#DC2626', bgColor: '#FEE2E2', label: '직행' };
  }

  // 4자리 지선버스: 5xxx, 6xxx, 7xxx
  if (num.length === 4 && (num.startsWith('5') || num.startsWith('6') || num.startsWith('7'))) {
    return { type: 'branch', color: '#16A34A', bgColor: '#DCFCE7', label: '지선' };
  }

  // 3자리: 간선버스
  if (num.length === 3) {
    return { type: 'trunk', color: '#2563EB', bgColor: '#DBEAFE', label: '간선' };
  }

  // 순환버스: 0x
  if (num.length <= 2 && num.startsWith('0')) {
    return { type: 'circular', color: '#CA8A04', bgColor: '#FEF9C3', label: '순환' };
  }

  // 마을버스: 짧은 숫자
  if (num.length <= 2) {
    return { type: 'village', color: '#65A30D', bgColor: '#ECFCCB', label: '마을' };
  }

  return { type: 'general', color: '#65A30D', bgColor: '#ECFCCB', label: '일반' };
};

// 지하철 노선별 색상
export const getSubwayColor = (line: string): {
  color: string;
  bgColor: string;
  textColor: string;
} => {
  const lineMap: Record<string, { color: string; bgColor: string; textColor: string }> = {
    '1호선': {
      color: '#0052A4',
      bgColor: '#E3F2FD',
      textColor: '#0052A4'
    },
    '2호선': {
      color: '#00A84D',
      bgColor: '#E8F5E9',
      textColor: '#00A84D'
    },
    '3호선': {
      color: '#EF7C1C',
      bgColor: '#FFF3E0',
      textColor: '#EF7C1C'
    },
    '4호선': {
      color: '#00A5DE',
      bgColor: '#E1F5FE',
      textColor: '#00A5DE'
    },
    '5호선': {
      color: '#996CAC',
      bgColor: '#F3E5F5',
      textColor: '#996CAC'
    },
    '6호선': {
      color: '#CD7C2F',
      bgColor: '#FFF8E1',
      textColor: '#CD7C2F'
    },
    '7호선': {
      color: '#747F00',
      bgColor: '#F9FBE7',
      textColor: '#747F00'
    },
    '8호선': {
      color: '#E6186C',
      bgColor: '#FCE4EC',
      textColor: '#E6186C'
    },
    '9호선': {
      color: '#BDB092',
      bgColor: '#EFEBE9',
      textColor: '#8D6E63'
    },
    '신분당선': {
      color: '#D31145',
      bgColor: '#FCE4EC',
      textColor: '#D31145'
    },
    '경의중앙선': {
      color: '#77C4A3',
      bgColor: '#E0F2F1',
      textColor: '#00897B'
    },
    '경춘선': {
      color: '#0C8E72',
      bgColor: '#E0F2F1',
      textColor: '#0C8E72'
    },
    '수인분당선': {
      color: '#FABE00',
      bgColor: '#FFFDE7',
      textColor: '#F57F17'
    },
    '공항철도': {
      color: '#0090D2',
      bgColor: '#E1F5FE',
      textColor: '#0090D2'
    },
    '경강선': {
      color: '#0054A6',
      bgColor: '#E3F2FD',
      textColor: '#0054A6'
    },
    '서해선': {
      color: '#8FC31F',
      bgColor: '#F1F8E9',
      textColor: '#689F38'
    },
    '신림선': {
      color: '#6789CA',
      bgColor: '#E8EAF6',
      textColor: '#3F51B5'
    },
    'GTX-A': {
      color: '#9E4D9E',
      bgColor: '#F3E5F5',
      textColor: '#7B1FA2'
    }
  };

  return lineMap[line] || {
    color: '#6B7280',
    bgColor: '#F3F4F6',
    textColor: '#6B7280'
  };
};
