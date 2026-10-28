import type { ReactNode } from 'react';
import { brand, SITES_DOMAIN } from '../brand';
import { useI18n } from '../i18n';
import { TrangPage } from '../public-page';

function LegalPage({ title, dataId, children }: { readonly title: string; readonly dataId: string; readonly children: ReactNode }): ReactNode {
  return (
    <TrangPage>
      <article className="prose" data-id={dataId}>
        <h1>{title}</h1>
        {children}
      </article>
    </TrangPage>
  );
}

/** What the app keeps today. Update it whenever the app starts keeping something new. */
export function PrivacyPage(): ReactNode {
  const { t, locale } = useI18n();
  const name = brand.appName;
  const domain = brand.primaryTenant.domain;
  return (
    <LegalPage title={t('privacy.title')} dataId="privacy">
      {locale === 'vi' ? (
        <>
          <p>Trang này nói {name} lưu gì về bạn, vì sao, và bao lâu.</p>
          <h2>Tài khoản</h2>
          <p>
            Bạn đăng nhập bằng tài khoản {domain}. {name} chỉ nhận một mã định danh tài khoản (không nhận email, tên hay ảnh đại diện) và
            đặt một cookie phiên đăng nhập. Cookie này chỉ dùng để giữ bạn đăng nhập, hết hạn sau 30 ngày (hoặc sau 7 ngày không dùng);
            phiên hết hạn bị xoá khỏi máy chủ.
          </p>
          <h2>Lựa chọn giao diện</h2>
          <p>Ngôn ngữ và giao diện sáng/tối bạn chọn được lưu trong cookie <code>hd_lang</code>, <code>hd_theme</code>, dùng chung cho các app của {domain}.</p>
          <h2>Trang bạn đăng</h2>
          <p>
            Trang bạn đăng ở địa chỉ dạng tên-của-bạn.{SITES_DOMAIN} là trang công khai: ai có link đều xem được. Ở các trang đó {name} không
            đặt cookie nào.
          </p>
          <h2>Không có</h2>
          <p>Không quảng cáo, không bán hay chia sẻ dữ liệu cho bên thứ ba. Lượt xem được đếm ẩn danh bằng Cloudflare Web Analytics, không dùng cookie.</p>
        </>
      ) : (
        <>
          <p>This page says what {name} keeps about you, why, and for how long.</p>
          <h2>Account</h2>
          <p>
            You sign in with your {domain} account. {name} receives only an account identifier (no email, name or picture) and sets one
            session cookie, used only to keep you signed in; it expires after 30 days (or 7 days unused), and expired sessions are deleted
            from the server.
          </p>
          <h2>Display choices</h2>
          <p>The language and light/dark theme you pick are kept in the <code>hd_lang</code> and <code>hd_theme</code> cookies, shared by the {domain} apps.</p>
          <h2>Pages you publish</h2>
          <p>
            A page you publish at an address like your-name.{SITES_DOMAIN} is public: anyone with the link can see it. {name} sets no cookie
            on those pages.
          </p>
          <h2>None of this</h2>
          <p>No ads, no selling or sharing of data with third parties. Visits are counted anonymously by Cloudflare Web Analytics, without cookies.</p>
        </>
      )}
    </LegalPage>
  );
}

export function TermsPage(): ReactNode {
  const { t, locale } = useI18n();
  const name = brand.appName;
  return (
    <LegalPage title={t('terms.title')} dataId="terms">
      {locale === 'vi' ? (
        <>
          <p>Dùng {name} nghĩa là bạn đồng ý với các điều sau.</p>
          <h2>Nội dung của bạn</h2>
          <p>
            Bạn chịu trách nhiệm về chữ, ảnh và mã nguồn bạn đưa lên: bạn phải có quyền dùng chúng. Không đăng nội dung vi phạm pháp luật,
            lừa đảo, giả mạo ngân hàng, cơ quan nhà nước hay thương hiệu khác, xúc phạm hay xâm phạm quyền của người khác.
          </p>
          <h2>Gỡ trang</h2>
          <p>Trang vi phạm các điều trên có thể bị gỡ ngay, không cần báo trước.</p>
          <h2>Dịch vụ</h2>
          <p>{name} đang được làm và có thể thay đổi; dịch vụ được cung cấp như hiện có, không cam kết luôn hoạt động.</p>
        </>
      ) : (
        <>
          <p>Using {name} means you agree to the following.</p>
          <h2>Your content</h2>
          <p>
            You are responsible for the text, photos and source code you put up, and you must have the right to use them. Do not publish
            anything unlawful, scams, imitations of banks, government bodies or other brands, or anything offensive or infringing on
            others&apos; rights.
          </p>
          <h2>Removal</h2>
          <p>A page that breaks these terms may be removed at once, without notice.</p>
          <h2>The service</h2>
          <p>{name} is being built and may change; it is provided as is, with no promise that it is always available.</p>
        </>
      )}
    </LegalPage>
  );
}
