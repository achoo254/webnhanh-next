import { CINEMA_FONTS, STYLE_FONTS } from '@webnhanh/templates/shop-fonts';
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

/** Where a hoandat.com account is deleted (auth-next ADR 0018): the app has no deletion of its own. */
const ACCOUNT_DELETE_URL = 'https://auth.hoandat.com/account#account-delete';

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
            đang xem. Đăng nhập bằng Apple thì không có ảnh đại diện, vì Apple không chia sẻ ảnh.
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
          <h2>Xoá tài khoản</h2>
          <p>
            Tài khoản chỉ xoá được ở <a href={ACCOUNT_DELETE_URL}>trang tài khoản {domain}</a>; {name} không có nút xoá riêng. Khi bạn
            xoá ở đó, {name} xoá ngay mọi dữ liệu của tài khoản: tên, email, ảnh, mọi website của bạn (gỡ khỏi địa chỉ .{SITES_DOMAIN}
            cùng ảnh, đơn hàng, xác nhận tham dự, bản build), máy nhận thông báo, liên kết Chat và mọi phiên đăng nhập. Tên website được
            giải phóng ngay. Báo cáo vi phạm người khác gửi về website của bạn vẫn được giữ cho quản trị viên, không còn gắn với tài khoản.
          </p>
          <h2>Không có</h2>
          <p>Không quảng cáo, không bán hay chia sẻ dữ liệu cho bên thứ ba. Lượt xem được đếm ẩn danh bằng Cloudflare Web Analytics, không dùng cookie.</p>
        </>
      ) : locale === 'zh-CN' ? (
        <>
          <p>本页说明 {name} 保存了你的哪些信息、为什么保存，以及保存多久。</p>
          <h2>账号</h2>
          <p>
            你使用 {domain} 账号登录。每次登录时，{name} 从 {domain} 获得你的账号标识、显示名称、电子邮箱和头像地址，并与你的账号一起保存（下次登录时更新为最新信息）。
            名称、邮箱和头像只显示在你自己在 {name} 中的账号菜单里：不会出现在你发布的网站上，也不会发送给任何人。头像由你的浏览器直接从 Google 或 GitHub（你登录所用账号的头像存放处）加载，
            不附带你正在浏览的页面地址。使用 Apple 登录则没有头像，因为 Apple 不共享头像。
          </p>
          <p>{name} 只设置一个登录会话 Cookie，仅用于保持你的登录状态；它在 30 天后（或 7 天未使用后）失效，失效的会话会从服务器上删除。</p>
          <h2>界面偏好</h2>
          <p>你选择的语言保存在 <code>hd_lang</code> Cookie 中，由 {domain} 的各个应用共用。</p>
          <h2>你发布的网站</h2>
          <p>你发布在 your-name.{SITES_DOMAIN} 这类地址上的网站是公开的：任何拿到链接的人都能查看。{name} 不会在这些网站上设置任何 Cookie。</p>
          <h2>删除账号</h2>
          <p>
            账号只能在 <a href={ACCOUNT_DELETE_URL}>{domain} 账号页面</a>删除；{name} 本身没有删除功能。你在那里删除后，{name} 会立即删除该账号的所有数据：名称、邮箱、头像、
            你的所有网站（从 .{SITES_DOMAIN} 地址下线，连同照片、订单、出席回复和构建记录）、通知设备、Chat 关联以及所有登录会话。网站名称会立即释放。他人对你的网站提交的违规举报会为管理员保留，
            但不再与账号关联。
          </p>
          <h2>我们不做的事</h2>
          <p>没有广告，不出售也不向第三方分享数据。访问量由 Cloudflare Web Analytics 匿名统计，不使用 Cookie。</p>
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
            is kept), without the address of the page you are on. Signing in with Apple gives no picture, because Apple does not share one.
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
          <h2>Deleting your account</h2>
          <p>
            The account can only be deleted on the <a href={ACCOUNT_DELETE_URL}>{domain} account page</a>; {name} has no deletion of its
            own. When you delete it there, {name} deletes everything of it at once: the name, email, picture, all your websites (taken off
            their .{SITES_DOMAIN} address with their photos, orders, replies and builds), notification devices, the Chat link and every
            session. The website names are free at once. Abuse reports others sent about your websites are kept for the admins, no longer
            tied to the account.
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
      ) : locale === 'zh-CN' ? (
        <>
          <p>使用 {name} 即表示你同意以下条款。</p>
          <h2>你的内容</h2>
          <p>
            你对上传的文字、照片和源代码负责，并且必须有权使用它们。不得发布违法、诈骗、冒充银行、政府机构或其他品牌、冒犯他人或侵犯他人权利的内容。
          </p>
          <h2>移除网站</h2>
          <p>违反上述条款的网站可能会被立即移除，不另行通知。</p>
          <p>
            发现违规网站？<Link to="/report">举报违规</Link>或发邮件至 {ABUSE_EMAIL}。
          </p>
          <h2>服务</h2>
          <p>{name} 仍在开发中，可能会有变化；服务按现状提供，不保证始终可用。</p>
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
 * Every typeface a template page or its share picture uses: the looks' and layouts' faces (from the templates' own lists) and Inter,
 * the share picture's face (`CARD_FONTS` of the templates).
 */
const FONT_FAMILIES = [
  ...new Set([...[...Object.values(STYLE_FONTS), CINEMA_FONTS].flatMap((fonts) => [fonts.display.family, ...fonts.body.map((face) => face.family)]), 'Inter']),
];

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
            Ảnh mẫu, ảnh minh hoạ các mẫu ở trang chọn mẫu, ảnh và hoạ tiết của từng kiểu mẫu được vẽ bằng AI cho các app của {domain}, trên máy của chính {domain}, bằng các mô hình
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
      ) : locale === 'zh-CN' ? (
        <>
          <p>{name} 网站模板中的字体、图片和装饰来自哪里。</p>
          <h2>字体</h2>
          <p>
            以下字体来自 Google Fonts，由 Fontsource 打包，按 SIL Open Font License 1.1 许可使用。每个网站自带字体文件（仅拉丁字母和越南语字符），不从其他服务器加载字体。
          </p>
          {fonts}
          <h2>图片</h2>
          <p>
            示例图片、模板选择页的图片，以及每种模板风格的图片和装饰，均由 AI 为 {domain} 的应用绘制，在 {domain} 自己的机器上使用开源模型完成（Qwen-Image、Z-Image、FLUX.2
            klein，Apache-2.0 许可；BiRefNet，MIT 许可，用于去除背景）。图片归 {domain} 所有，保留所有权利（不是 CC0）。图片中都没有文字（只有传统婚礼装饰带有双喜字样）：
            网站上的每个字都是你可以修改的。
          </p>
          <p>你上传的照片仍归你所有。</p>
          <h2>装饰和示例文字</h2>
          <p>
            不属于任何模板风格的灯笼、梅花、枝叶等装饰，是用 SVG 和 CSS 专为 {name} 绘制的。春节祝福语和示例文字专为 {name} 撰写，没有抄自任何诗歌、歌曲或已出版的文字。
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
            The sample pictures, the pictures of the template picker and the pictures and ornaments of each template look are AI-generated for the {domain} apps on {domain}&apos;s
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
