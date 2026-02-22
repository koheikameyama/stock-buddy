import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => {
  const locale = 'ja'; // 当面は日本語固定

  return {
    locale,
    messages: (await import(`../locales/${locale}/index.ts`)).default
  };
});
