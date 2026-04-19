// 지하철 호선 코드(ODsay/서울 API) → 호선 이름 변환
export const subwayCodeToLineName = (code: number | null | undefined): string => {
  if (!code) return ''
  const map: Record<number, string> = {
    1: '1호선', 2: '2호선', 3: '3호선', 4: '4호선',
    5: '5호선', 6: '6호선', 7: '7호선', 8: '8호선', 9: '9호선',
    21: '신분당선', 22: '경의중앙선', 23: '수인분당선',
    26: '공항철도', 27: '경강선', 29: '서해선',
    30: '신림선', 31: 'GTX-A',
  }
  return map[code] ?? `${code}호선`
}

// 실시간 지하철 API lineName 코드("1002") → 호선 이름("2호선")
export const subwayApiCodeToLineName = (lineName: string): string => {
  const map: Record<string, string> = {
    '1001': '1호선', '1002': '2호선', '1003': '3호선', '1004': '4호선',
    '1005': '5호선', '1006': '6호선', '1007': '7호선', '1008': '8호선', '1009': '9호선',
    '1071': '신분당선', '1063': '경의중앙선', '1075': '수인분당선',
    '1065': '공항철도', '1067': '경강선', '1077': '신림선',
  }
  return map[lineName] ?? lineName
}

// ODsay busType 코드 → 색상 (busType이 null이면 번호 기반 추론으로 fallback)
export const getBusTypeByOdsay = (
  busType: number | null | undefined,
  fallbackBusNumber: string,
): { type: string; color: string; bgColor: string; label: string } => {
  const map: Record<number, { type: string; color: string; bgColor: string; label: string }> = {
    1: { type: 'trunk',    color: '#2563EB', bgColor: '#DBEAFE', label: '간선' },
    2: { type: 'branch',   color: '#16A34A', bgColor: '#DCFCE7', label: '지선' },
    3: { type: 'circular', color: '#CA8A04', bgColor: '#FEF9C3', label: '순환' },
    4: { type: 'metro',    color: '#DC2626', bgColor: '#FEE2E2', label: '광역' },
    5: { type: 'airport',  color: '#4B5563', bgColor: '#F3F4F6', label: '공항' },
    6: { type: 'village',  color: '#65A30D', bgColor: '#ECFCCB', label: '마을' },
  }
  if (busType != null && map[busType]) return map[busType]
  return getBusType(fallbackBusNumber)
}

// 버스 노선 타입 구분
export const getBusType = (busNumber: string): {
  type: string;
  color: string;
  bgColor: string;
  label: string;
} => {
  const num = busNumber.replace(/[^0-9]/g, '');
  
  // 공항버스: 6001, 6002 등 60으로 시작하는 4자리
  if (num.length >= 4 && num.startsWith('60')) {
    return { type: 'airport', color: '#4B5563', bgColor: '#F3F4F6', label: '공항' };
  }

  // 광역버스: M, 9xxx, 1xxx
  if (busNumber.startsWith('M') || num.startsWith('9') || num.startsWith('1')) {
    return { type: 'metro', color: '#DC2626', bgColor: '#FEE2E2', label: '광역' };
  }

  // 간선버스: 2xxx, 3xxx, 4xxx
  if (num.startsWith('2') || num.startsWith('3') || num.startsWith('4')) {
    return { type: 'trunk', color: '#2563EB', bgColor: '#DBEAFE', label: '간선' };
  }

  // 지선버스: 5xxx, 6xxx, 7xxx
  if (num.startsWith('5') || num.startsWith('6') || num.startsWith('7')) {
    return { type: 'branch', color: '#16A34A', bgColor: '#DCFCE7', label: '지선' };
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
