import { STYLE_FONTS } from '@webnhanh/templates/shop-fonts';
import { ABUSE_EMAIL } from '@webnhanh/db/site-name';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { brand, SITES_DOMAIN } from '../brand';
import { useI18n } from '../i18n';
import { AppPage } from '../public-page';

function LegalPage({ title, dataId, children }: { readonly title: string; readonly dataId: string; readonly children: ReactNode }): ReactNode {
  return (
    <AppPage>
      <article className="prose" data-id={dataId}>
        <h1>{title}</h1>
        {children}
      </article>
    </AppPage>
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
            Bạn đăng nhập bằng tài khoản {domain}. Mỗi lần bạn đăng nhập, {name} nhận từ {domain} mã định danh tài khoản, tên hiển thị, email
            và địa chỉ ảnh đại diện của bạn, rồi lưu chúng cùng tài khoản (lần đăng nhập sau thay bằng thông tin mới). Tên, email và ảnh chỉ
            dùng để hiện ở menu tài khoản của chính bạn trong {name}: không hiện trên website bạn đăng, không gửi cho ai khác. Ảnh đại diện
            được trình duyệt của bạn tải thẳng từ Google hoặc GitHub (nơi ảnh của tài khoản đăng nhập được lưu), không kèm địa chỉ trang
            đang xem.
          </p>
          <p>
            {name} đặt một cookie phiên đăng nhập. Cookie này chỉ dùng để giữ bạn đăng nhập, hết hạn sau 30 ngày (hoặc sau 7 ngày không
            dùng); phiên hết hạn bị xoá khỏi máy chủ.
          </p>
          <h2>Lựa chọn giao diện</h2>
          <p>Ngôn ngữ bạn chọn được lưu trong cookie <code>hd_lang</code>, dùng chung cho các app của {domain}.</p>
          <h2>Website bạn đăng</h2>
          <p>
            Website bạn đăng ở địa chỉ dạng tên-của-bạn.{SITES_DOMAIN} là website công khai: ai có link đều xem được. Ở các website đó {name} không
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
            You sign in with your {domain} account. Each time you sign in, {name} receives from {domain} your account identifier, display
            name, email and picture address, and keeps them with your account (the next sign-in replaces them with what is current). The
            name, email and picture are only shown in your own account menu in {name}: not on the websites you publish, and not sent to
            anyone else. Your browser loads the picture straight from Google or GitHub (where the picture of the account you sign in with
            is kept), without the address of the page you are on.
          </p>
          <p>
            {name} sets one session cookie, used only to keep you signed in; it expires after 30 days (or 7 days unused), and expired
            sessions are deleted from the server.
          </p>
          <h2>Display choices</h2>
          <p>The language you pick is kept in the <code>hd_lang</code> cookie, shared by the {domain} apps.</p>
          <h2>Websites you publish</h2>
          <p>
            A website you publish at an address like your-name.{SITES_DOMAIN} is public: anyone with the link can see it. {name} sets no cookie
            on those websites.
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
          <h2>Gỡ website</h2>
          <p>Website vi phạm các điều trên có thể bị gỡ ngay, không cần báo trước.</p>
          <p>
            Thấy website vi phạm? <Link to="/bao-cao">Báo cáo vi phạm</Link> hoặc gửi email tới {ABUSE_EMAIL}.
          </p>
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
          <p>A website that breaks these terms may be removed at once, without notice.</p>
          <p>
            Found a website that breaks them? <Link to="/report">Report it</Link> or write to {ABUSE_EMAIL}.
          </p>
          <h2>The service</h2>
          <p>{name} is being built and may change; it is provided as is, with no promise that it is always available.</p>
        </>
      )}
    </LegalPage>
  );
}

/**
 * Every typeface a template page or its share picture uses: the looks' faces (from the templates' own list) and Inter,
 * the share picture's face (`CARD_FONTS` of the templates).
 */
const FONT_FAMILIES = [...new Set([...Object.values(STYLE_FONTS).flatMap((fonts) => [fonts.display.family, ...fonts.body.map((face) => face.family)]), 'Inter'])];

/** Where the fonts and pictures of the templates come from, and under which terms (packages/templates/CREDITS.md). */
export function CreditsPage(): ReactNode {
  const { t, locale } = useI18n();
  const name = brand.appName;
  const domain = brand.primaryTenant.domain;
  const fonts = (
    <ul data-id="credits-fonts">
      {FONT_FAMILIES.map((family) => (
        <li key={family}>
          {family} <span className="hint">(SIL Open Font License 1.1)</span>
        </li>
      ))}
    </ul>
  );
  return (
    <LegalPage title={t('credits.title')} dataId="credits">
      {locale === 'vi' ? (
        <>
          <p>Phông chữ, ảnh và hoạ tiết trong các mẫu website của {name} đến từ đâu.</p>
          <h2>Phông chữ</h2>
          <p>
            Các phông dưới đây là phông của Google Fonts, đóng gói bởi Fontsource, dùng theo giấy phép SIL Open Font License 1.1. Mỗi website mang
            theo phông của mình (chỉ bộ chữ Latin và tiếng Việt), không tải phông từ máy chủ khác.
          </p>
          {fonts}
          <h2>Ảnh</h2>
          <p>
            Ảnh mẫu, ảnh và hoạ tiết của từng kiểu mẫu được vẽ bằng AI cho các app của {domain}, trên máy của chính {domain}, bằng các mô hình
            mã nguồn mở (Qwen-Image, Z-Image, FLUX.2 klein, giấy phép Apache-2.0; BiRefNet, giấy phép MIT, để tách nền). Ảnh thuộc về {domain},
            giữ mọi quyền (không phải CC0). Không ảnh nào có chữ (riêng hoạ tiết thiệp cưới truyền thống có hình chữ Song Hỷ): mọi chữ trên
            website là chữ bạn sửa được.
          </p>
          <p>Ảnh bạn tải lên vẫn là của bạn.</p>
          <h2>Hoạ tiết và chữ mẫu</h2>
          <p>
            Đèn lồng, hoa mai, cành lá và các hoạ tiết khác không thuộc kiểu mẫu nào được vẽ riêng cho {name} bằng SVG và CSS. Lời chúc Tết và chữ mẫu được viết riêng
            cho {name}, không chép từ thơ, bài hát hay văn bản đã xuất bản nào.
          </p>
        </>
      ) : (
        <>
          <p>Where the fonts, pictures and decorations of the {name} templates come from.</p>
          <h2>Fonts</h2>
          <p>
            These are Google Fonts typefaces, packaged by Fontsource, used under the SIL Open Font License 1.1. Every website carries its own
            font files (Latin and Vietnamese only) and loads no font from anyone else.
          </p>
          {fonts}
          <h2>Pictures</h2>
          <p>
            The sample pictures and the pictures and ornaments of each template look are AI-generated for the {domain} apps on {domain}&apos;s
            own machine with open models (Qwen-Image, Z-Image, FLUX.2 klein under Apache-2.0; BiRefNet under MIT for background removal). They
            are owned by {domain}, all rights reserved (not CC0). None contains text (only the traditional wedding ornament shows the
            double-happiness sign): every word on a website is one you can change.
          </p>
          <p>Photos you upload stay yours.</p>
          <h2>Decorations and sample text</h2>
          <p>
            The lanterns, apricot blossoms, sprigs and other decorations that belong to no template look are drawn for {name} in SVG and CSS. The Tết greetings and sample
            texts are written for {name}, not copied from any poem, song or published text.
          </p>
        </>
      )}
    </LegalPage>
  );
}
