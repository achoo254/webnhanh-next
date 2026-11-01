/**
 * The words of the guide pages: what people search for ("thiệp cưới online", "website bán hàng miễn phí", "thiệp Tết
 * 2027"), answered with what the matching template really does (its schema in @webnhanh/templates: fields, limits,
 * the order and RSVP forms), each page ending on that template in /new.
 *
 * Vietnamese only, whatever the visitor's language: these pages answer Vietnamese searches, and crawlers that run
 * the script (with an English browser) must read the same words as the prerendered HTML.
 */
import type { TemplateId } from '@webnhanh/templates';
import { brand, SITES_DOMAIN } from '../brand';
import { GUIDE_PATHS, type GuideId, type GuidePath } from './guide-paths';

export interface GuideSection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly list?: readonly string[];
}

export interface GuideStep {
  readonly title: string;
  readonly body: string;
}

export interface GuideQuestion {
  readonly question: string;
  readonly answer: string;
}

export interface Guide {
  readonly id: GuideId;
  readonly path: GuidePath;
  readonly template: TemplateId;
  /** `<title>`, og:title. */
  readonly title: string;
  /** Meta description, og:description (about 150 characters). */
  readonly description: string;
  readonly heading: string;
  readonly eyebrow: string;
  readonly lede: string;
  /** Heading of the template's looks, each a link into /new with that look picked. */
  readonly looksHeading: string;
  readonly sections: readonly GuideSection[];
  readonly steps: readonly GuideStep[];
  readonly faq: readonly GuideQuestion[];
  /** The call to action, to `/new?template=<template>`. */
  readonly cta: string;
  /** How the other guides name this one in their "Gợi ý khác". */
  readonly linkLabel: string;
  /** First published, for the JSON-LD (YYYY-MM-DD). */
  readonly datePublished: string;
}

const PUBLISHED = '2026-11-01';

function buildGuides(): Readonly<Record<GuideId, Guide>> {
  const app = brand.appName;
  const domain = brand.primaryTenant.domain;
  const signUpStep: GuideStep = {
    title: 'Đăng ký miễn phí',
    body: `Tạo tài khoản ${domain} bằng Google, GitHub hoặc Apple. Xong là quay lại đúng mẫu, kiểu và địa chỉ bạn vừa chọn.`,
  };
  return {
    wedding: {
      id: 'wedding',
      path: GUIDE_PATHS.wedding,
      template: 'wedding',
      title: `Thiệp cưới online miễn phí, có xác nhận tham dự | ${app}`,
      description:
        'Làm thiệp cưới online miễn phí trên điện thoại: tên cô dâu chú rể, ngày cưới, chỉ đường tới nơi tổ chức, form xác nhận tham dự. Gửi link qua Zalo, Messenger.',
      heading: 'Thiệp cưới online miễn phí',
      eyebrow: 'Thiệp cưới',
      lede: `Một tấm thiệp cưới có địa chỉ riêng, mở được trên mọi điện thoại: khách xem ngày giờ, bấm chỉ đường tới nơi tổ chức và báo có đến hay không ngay trên thiệp. Làm trong vài phút với ${app}, không cần biết làm web.`,
      looksHeading: 'Bốn kiểu thiệp cưới để bắt đầu',
      sections: [
        {
          heading: 'Một thiệp cưới online cần có gì',
          paragraphs: ['Mẫu thiệp cưới có sẵn mọi phần khách cần, bạn chỉ điền chữ và thay ảnh:'],
          list: [
            'Tên cô dâu, chú rể và lời mời của hai bạn (tối đa 600 ký tự).',
            'Ngày cưới, kèm ngày âm lịch ghi theo cách của gia đình, ví dụ "tức ngày 23 tháng 10 năm Bính Ngọ".',
            'Tối đa bốn lễ (lễ thành hôn, tiệc nhà trai, tiệc nhà gái…), mỗi lễ có ngày giờ, nơi tổ chức và nút Chỉ đường mở bản đồ từ địa chỉ hoặc link Google Maps bạn dán vào.',
            'Đếm ngược tới ngày cưới, tự cập nhật mỗi ngày.',
            'Ảnh bìa và album tối đa 12 ảnh.',
            'Form xác nhận tham dự: khách ghi tên, số điện thoại, có đến hay không, số người đi cùng và lời nhắn cho cô dâu chú rể.',
          ],
        },
        {
          heading: 'Xác nhận tham dự về thẳng điện thoại của bạn',
          paragraphs: [
            `Mỗi lời xác nhận vào hộp thư của thiệp trong ${app}, kèm tổng số khách sẽ đến, để bạn báo nhà hàng số bàn. Bật thông báo trên máy, hoặc nhận tin qua bot trong app Chat của ${domain}, để biết ngay khi có người trả lời. Không cần phần này thì tắt đi; khách vẫn liên hệ được qua Zalo, điện thoại hoặc Facebook bạn điền.`,
            'Ảnh bạn tải lên được chuyển sang WebP và bỏ hết thông tin đi kèm (như vị trí chụp) trước khi lưu, nên thiệp mở nhanh và không lộ gì ngoài tấm ảnh.',
          ],
        },
        {
          heading: 'Gửi thiệp cưới qua Zalo, Messenger',
          paragraphs: [
            `Bấm Đăng là thiệp có địa chỉ dạng ten-cua-ban.${SITES_DOMAIN}, ví dụ tuan-va-lan.${SITES_DOMAIN}. Dán link vào Zalo, Messenger hay Facebook: tin nhắn hiện kèm ảnh xem trước của thiệp. Khách bấm vào là xem được ngay, không cần cài app hay đăng nhập.`,
          ],
        },
      ],
      steps: [
        { title: 'Chọn kiểu thiệp', body: 'Chọn một kiểu ở trên và đặt địa chỉ cho thiệp. Bước này chưa cần tài khoản.' },
        signUpStep,
        { title: 'Điền và gửi', body: 'Điền tên, ngày, các lễ, thay ảnh, xem trước rồi bấm Đăng. Gửi link cho khách qua Zalo, Messenger.' },
      ],
      faq: [
        { question: 'Làm thiệp cưới online có mất phí không?', answer: 'Không. Tài khoản và thiệp cưới đều miễn phí, thiệp không có quảng cáo.' },
        {
          question: 'Khách có cần cài app để xem thiệp không?',
          answer: 'Không. Thiệp là một trang web, mở bằng trình duyệt có sẵn trên điện thoại, kể cả trình duyệt trong Zalo và Messenger.',
        },
        {
          question: 'Tôi có tắt được phần xác nhận tham dự không?',
          answer: 'Có. Phần xác nhận tham dự bật sẵn, bạn tắt được trong trang sửa thiệp; khi đó khách liên hệ bạn qua Zalo, điện thoại hoặc Facebook bạn điền.',
        },
        { question: 'Gửi thiệp rồi còn sửa được không?', answer: 'Được. Sửa rồi bấm Đăng lại, link cũ mở ra bản mới, không phải gửi lại.' },
      ],
      cta: 'Chọn mẫu thiệp cưới',
      linkLabel: 'Thiệp cưới online miễn phí',
      datePublished: PUBLISHED,
    },
    shop: {
      id: 'shop',
      path: GUIDE_PATHS.shop,
      template: 'shop',
      title: `Làm website bán hàng miễn phí trên điện thoại | ${app}`,
      description: `Tạo website bán hàng miễn phí ngay trên điện thoại: ảnh sản phẩm, giá, form đặt hàng, địa chỉ riêng ten-tiem.${SITES_DOMAIN}. Đơn mới báo về máy bạn.`,
      heading: 'Làm website bán hàng miễn phí trên điện thoại',
      eyebrow: 'Bán hàng nhận đơn',
      lede: `Đang bán qua Facebook, Zalo và muốn có một trang riêng để khách xem hết sản phẩm rồi đặt hàng? Mẫu Bán hàng nhận đơn của ${app} cho bạn trang đó, làm ngay trên điện thoại, không tốn tiền, không cần biết làm web.`,
      looksHeading: 'Sáu kiểu theo ngành hàng để bắt đầu',
      sections: [
        {
          heading: 'Trang bán hàng có những gì',
          paragraphs: ['Mỗi kiểu có sẵn chữ mẫu và ảnh mẫu theo ngành hàng; bạn thay bằng tiệm và sản phẩm của mình:'],
          list: [
            'Tên tiệm, lời giới thiệu và ảnh bìa.',
            'Tối đa 30 sản phẩm, mỗi sản phẩm có ảnh, mô tả và giá ghi tự do ("35.000đ", "Từ 50k", "Liên hệ"); thêm, bớt, xếp lại lúc nào cũng được.',
            'Form đặt hàng: khách ghi họ tên, số điện thoại, địa chỉ nhận hàng, sản phẩm, số lượng và ghi chú. Form chạy được cả khi trình duyệt tắt JavaScript.',
            'Nút liên hệ qua Zalo, gọi điện và Facebook.',
            'Ba kiểu trang (Rực rỡ, Tinh tế, Ấm cúng) và màu để chọn, xem trước ngay khi sửa.',
          ],
        },
        {
          heading: 'Địa chỉ riêng cho tiệm',
          paragraphs: [
            `Mỗi website có địa chỉ dạng ten-tiem.${SITES_DOMAIN}, ví dụ tiem-banh-nha-bo.${SITES_DOMAIN}: 3 đến 30 ký tự, chữ thường không dấu, số và dấu gạch ngang. Gắn link vào trang Facebook, TikTok, Instagram của tiệm hay in lên tem đơn hàng. Dán vào Zalo, Facebook thì tin nhắn hiện kèm ảnh xem trước của trang.`,
            'Ảnh sản phẩm (tối đa 5 MB mỗi ảnh) được tự chuyển sang WebP nhẹ hơn, nên trang mở nhanh cả khi khách dùng 4G.',
          ],
        },
        {
          heading: 'Đơn hàng báo về ngay',
          paragraphs: [
            `Đơn khách gửi vào hộp đơn của tiệm trong ${app}: số đơn mới hiện trên danh sách website, xử lý xong thì đánh dấu. Bật thông báo trên máy, hoặc nhận tin qua bot trong app Chat của ${domain}, để không bỏ sót đơn nào.`,
            `${app} chưa có thanh toán online: khách đặt, bạn gọi hoặc nhắn để chốt đơn và giao hàng như vẫn làm.`,
          ],
        },
      ],
      steps: [
        { title: 'Chọn kiểu và địa chỉ', body: 'Chọn kiểu gần với ngành hàng của bạn và đặt địa chỉ cho tiệm. Bước này chưa cần tài khoản.' },
        signUpStep,
        { title: 'Thêm sản phẩm và đăng', body: 'Sửa tên tiệm, thêm sản phẩm, chụp ảnh bằng điện thoại, xem trước rồi bấm Đăng. Gửi link cho khách.' },
      ],
      faq: [
        { question: 'Làm website bán hàng có thật sự miễn phí không?', answer: 'Có. Tạo tài khoản, làm trang và nhận đơn đều miễn phí, không thu phí theo đơn.' },
        { question: 'Không có máy tính có làm được không?', answer: 'Được. Mọi bước, từ chọn mẫu, sửa chữ, tải ảnh tới bấm Đăng, đều làm trên điện thoại.' },
        { question: 'Khách đặt hàng có cần tài khoản không?', answer: 'Không. Khách chỉ điền form trên trang của bạn; đơn gửi thẳng về hộp đơn của tiệm.' },
        { question: 'Đổi giá, thêm sản phẩm thì sao?', answer: 'Sửa trong app rồi bấm Đăng lại. Địa chỉ giữ nguyên, link đã gửi khách vẫn dùng được.' },
      ],
      cta: 'Chọn mẫu website bán hàng',
      linkLabel: 'Làm website bán hàng miễn phí',
      datePublished: PUBLISHED,
    },
    tet: {
      id: 'tet',
      path: GUIDE_PATHS.tet,
      template: 'tet',
      title: `Thiệp Tết 2027 online Đinh Mùi, gửi qua Zalo | ${app}`,
      description:
        'Làm thiệp chúc Tết 2027 Đinh Mùi online miễn phí: lời chúc có sẵn hoặc tự viết, ảnh của bạn, nút gửi lời chúc lại. Gửi link qua Zalo, Messenger.',
      heading: 'Thiệp Tết 2027 online',
      eyebrow: 'Xuân Đinh Mùi 2027',
      lede: 'Mùng 1 Tết Đinh Mùi là thứ Bảy, 6/2/2027. Thay vì gửi tấm hình chúc Tết giống hệt mọi người, gửi một tấm thiệp có địa chỉ riêng, lời chúc của chính bạn, ảnh của nhà mình và nút để người nhận chúc lại.',
      looksHeading: 'Ba kiểu thiệp Tết để bắt đầu',
      sections: [
        {
          heading: 'Thiệp Tết online có gì',
          paragraphs: ['Mẫu thiệp chúc Tết làm sẵn cho năm Đinh Mùi:'],
          list: [
            'Dòng "Xuân Đinh Mùi 2027" trên đầu thiệp, tiêu đề và người nhận, ví dụ "Gửi ông bà và cả nhà".',
            'Lời chúc: chọn một trong sáu lời chúc viết sẵn (an khang, gia đình, làm ăn, bạn bè, đồng nghiệp, con cháu) rồi sửa lại, hoặc tự viết, tối đa 600 ký tự.',
            'Tên người gửi và một tấm ảnh của bạn.',
            'Nút "Gửi lời chúc lại": người nhận bấm là mở Zalo, gọi điện hoặc Facebook của bạn.',
            'Ba kiểu thiệp (đất sét đỏ vàng, đất sét hoa đào, thiệp giấy đỏ) và các màu đỏ, vàng ngày Tết.',
          ],
        },
        {
          heading: 'Gửi thiệp Tết qua Zalo, Messenger',
          paragraphs: [
            `Bấm Đăng là thiệp có địa chỉ dạng ten-cua-ban.${SITES_DOMAIN}. Dán link vào Zalo, Messenger hay Facebook: tin nhắn hiện ảnh xem trước của thiệp, người nhận bấm vào là xem, không cần cài gì.`,
            'Một thiệp gửi được cho cả danh bạ. Muốn thiệp riêng cho ông bà, sếp hay khách hàng thì làm thêm thiệp, mỗi thiệp một địa chỉ và một lời chúc.',
          ],
        },
        {
          heading: 'Làm sớm, sửa tới sát giao thừa',
          paragraphs: [
            'Làm thiệp từ bây giờ, sửa lời chúc hay đổi ảnh tới sát giao thừa rồi mới gửi. Sửa và đăng lại thì địa chỉ giữ nguyên, link đã gửi vẫn mở ra bản mới nhất.',
            'Thiệp không có quảng cáo và không đặt cookie nào trên máy người xem.',
          ],
        },
      ],
      steps: [
        { title: 'Chọn kiểu thiệp', body: 'Chọn một kiểu ở trên và đặt địa chỉ cho thiệp. Bước này chưa cần tài khoản.' },
        signUpStep,
        { title: 'Viết lời chúc và gửi', body: 'Chọn hoặc viết lời chúc, thay ảnh, xem trước rồi bấm Đăng. Gửi link qua Zalo, Messenger.' },
      ],
      faq: [
        { question: 'Tết 2027 là ngày nào?', answer: 'Mùng 1 Tết Đinh Mùi là thứ Bảy, ngày 6/2/2027 dương lịch.' },
        { question: 'Làm thiệp Tết online có mất tiền không?', answer: 'Không. Tài khoản và thiệp đều miễn phí, thiệp không có quảng cáo.' },
        { question: 'Người nhận có cần cài app không?', answer: 'Không. Thiệp mở bằng trình duyệt có sẵn trên điện thoại, kể cả trong Zalo và Messenger.' },
        { question: 'Gửi một thiệp cho nhiều người được không?', answer: 'Được, một link gửi cho bao nhiêu người cũng được. Muốn mỗi người một lời chúc riêng thì làm nhiều thiệp.' },
      ],
      cta: 'Chọn mẫu thiệp Tết',
      linkLabel: 'Thiệp Tết 2027 online',
      datePublished: PUBLISHED,
    },
  };
}

export const GUIDES: Readonly<Record<GuideId, Guide>> = buildGuides();

/** Where the call to action leads: the template picker with this guide's template chosen (and `variant`, if given). */
export function guideStartHref(guide: Guide, variant?: string): string {
  const params = new URLSearchParams({ template: guide.template, ...(variant ? { variant } : {}) });
  return `/new?${params.toString()}`;
}
