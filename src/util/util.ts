/**
 * @method isEmpty
 * @param {String | Number | Object} value
 * @returns {Boolean} true & false
 * @description this value is Empty Check
 */
export const isEmpty = (value: string | number | object): boolean => {
  if (value === null) {
    return true;
  } else if (typeof value !== 'number' && value === '') {
    return true;
  } else if (typeof value === 'undefined' || value === undefined) {
    return true;
  } else if (value !== null && typeof value === 'object' && !Object.keys(value).length) {
    return true;
  } else {
    return false;
  }
};

export const getPlaceHolders = (sql: string): string[] => {
  const regex = /[#$]{(\w+)}/g;
  const placeholders = [];

  let match;
  while ((match = regex.exec(sql)) !== null) {
    placeholders.push(match[1]);
  }

  return placeholders;
};

export const replaceString = (sql: string, map: { [key: string]: string }): string => {
  const regex = /[#$]{(\w+)}/g;

  return sql.replace(regex, (match, key) => map[key]);
};

export const hasSql = (value: string): boolean => {
  if (value === null || value === undefined) {
    return false;
  }

  const patterns: RegExp[] = [
    /(%27)|(')|(--)|(%23)|(#)/i,
    /((%3D)|(=))[^\n]*((%27)|(')|(--)|(%3B)|(;))/i,
    /\w*((%27)|('))((%6F)|o|(%4F))((%72)|r|(%52))/i,
    /((%27)|('))union/i,
    /\b(or|and)\b\s+[^'"\s]+\s*=\s*[^'"\s]+\b/i,
    /\b(select|update|delete|insert|drop|create|alter|truncate|exec|execute)\b/i,
  ];

  return patterns.some(pattern => pattern.test(value));
};
