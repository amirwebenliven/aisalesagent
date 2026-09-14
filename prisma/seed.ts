/**
 * Seeds one realistic tenant so every screen opens in a working state.
 *
 * The data is modelled on the live Al Taher Chemicals account we studied
 * (research/07-verified-in-app.md) — including a real conversation transcript,
 * so the inbox shows how the agent actually behaves rather than lorem.
 *
 *   bun prisma/seed.ts
 */
import { PrismaClient, ChannelKind, ChannelStatus, ConversationState, Direction } from "@prisma/client";

const prisma = new PrismaClient();

const SLUG = "al-taher";

// Minutes ago → Date, so the inbox always looks freshly active.
const ago = (mins: number) => new Date(Date.now() - mins * 60_000);

async function main() {
  console.log("Seeding…");

  await prisma.organization.deleteMany({ where: { slug: SLUG } });

  const org = await prisma.organization.create({
    data: {
      name: "Al Taher Chemicals",
      slug: SLUG,
      timezone: "Asia/Dubai",
      modelChat: "minimax-m3",
      modelUtility: "qwen3.7-flash",
      dailyCostCapUsd: 25,
    },
  });

  const user = await prisma.user.upsert({
    where: { email: "huzefaraja53@gmail.com" },
    update: {},
    create: { email: "huzefaraja53@gmail.com", name: "Huzefa Raja" },
  });

  await prisma.membership.create({
    data: { userId: user.id, organizationId: org.id, role: "OWNER" },
  });

  const agent = await prisma.agent.create({
    data: {
      organizationId: org.id,
      name: "Tia | ATC",
      persona:
        "You are Tia, a knowledgeable sales consultant at Al Taher Chemicals. You are warm, " +
        "direct and never pushy. You speak like a person who has worked in metal finishing for " +
        "years — confident about what you know, honest about what you do not.",
      goal:
        "Understand what the customer is trying to achieve, work out whether we supply the right " +
        "chemistry for it, and either book a call with a technical consultant or capture their " +
        "requirement and email address so the team can quote.",
      companyInfo:
        "Al Taher Chemicals (ATC) is a leading supplier in the UAE and GCC with over 20 years in " +
        "the chemical industry. We supply industrial electroplating chemicals, general metal " +
        "finishing, functional coatings, precious metal plating and metal colouring, plus " +
        "industrial abrasives and stainless steel cleaners. Authorised distributor for Atotech, " +
        "Eisenblätter, Ilve, Karbosan, Lafonte and RTP. Sectors: defence, aviation, marine " +
        "maintenance, heavy machinery, fasteners, telecommunications.",
      rules:
        "Never quote a price — pricing always comes from the team by email.\n" +
        "Never guess at chemistry for food-contact applications; flag it and hand over.\n" +
        "Never promise a delivery date.\n" +
        "Do not claim a product is compliant with a standard unless the knowledge base says so.\n" +
        "If the customer asks for a human, hand over immediately without arguing.",
      conversationFlow:
        "1. Greet and find out what they are working on.\n" +
        "2. Establish the substrate, the finish they want, and the industry.\n" +
        "3. Match it to a product family from the knowledge base.\n" +
        "4. Offer either a call with a consultant or a written quote by email.\n" +
        "5. Capture name and email before closing.",
      alertHumanWhen:
        "The customer asks for a human, a price, or a delivery commitment.\n" +
        "The application is food-contact, medical, or safety-critical.\n" +
        "The customer is unhappy, or mentions a complaint about an existing order.\n" +
        "The enquiry is for a volume above a drum, or mentions tender or contract.",
      concludeWhen:
        "The customer has a call booked, or has given an email for a quote, or has clearly said " +
        "they are only browsing.",
      primaryLanguage: "en",
      replyDelayMinMs: 15000,
      replyDelayMaxMs: 30000,
      splitMessages: true,
      maxRepliesPerTurn: 3,
    },
  });

  const whatsapp = await prisma.channelConnection.create({
    data: {
      organizationId: org.id,
      agentId: agent.id,
      kind: ChannelKind.WHATSAPP_QR,
      displayName: "+91 91093 32714",
      externalId: "919109332714",
      status: ChannelStatus.ACTIVE,
      warmupStartedAt: ago(60 * 24 * 3),
      dailySendCap: 58,
    },
  });

  const widget = await prisma.channelConnection.create({
    data: {
      organizationId: org.id,
      agentId: agent.id,
      kind: ChannelKind.WIDGET,
      displayName: "altaherchemicals.com",
      status: ChannelStatus.ACTIVE,
    },
  });

  await prisma.channelConnection.createMany({
    data: [
      {
        organizationId: org.id,
        kind: ChannelKind.TELEGRAM,
        displayName: "Telegram bot",
        status: ChannelStatus.CONNECTING,
      },
      {
        organizationId: org.id,
        kind: ChannelKind.INSTAGRAM,
        displayName: "Instagram DMs",
        status: ChannelStatus.PAUSED,
        lastErrorMessage: "Awaiting Meta App Review — instagram_manage_messages",
        lastErrorAt: ago(60 * 24 * 6),
      },
    ],
  });

  const source = await prisma.knowledgeSource.create({
    data: {
      organizationId: org.id,
      url: "https://altaherchemicals.com",
      pageCount: 59,
      faqCount: 8,
      status: "READY",
      lastCrawledAt: ago(60 * 26),
    },
  });

  const faqs = [
    {
      question: "What does Al Taher Chemicals specialise in?",
      answer:
        "Al Taher Chemicals is a leading UAE and GCC supplier with over 20 years of experience, " +
        "specialising in industrial electroplating chemicals, general metal finishing, functional " +
        "coatings, precious metal plating and metal colouring.",
      useCount: 25,
    },
    {
      question: "What plating and coating options are available?",
      answer:
        "Electroless nickel (low, mid, high phosphorous), rhodium and palladium, gold plating " +
        "(soft to hard), tin plating, zinc plating and zinc alloy, and chrome plating in both " +
        "conventional bright chrome and catalytic bright chrome.",
      useCount: 22,
    },
    {
      question: "How can I contact Al Taher Chemicals for a quote?",
      answer:
        "Email info@altaherchemicals.com, or use the WhatsApp, Call Now, Write Us or Get Quote " +
        "buttons on any product page.",
      useCount: 21,
    },
    {
      question: "What is decorative electroplating and which nickel options exist?",
      answer:
        "Decorative electroplating applies a metal finish to metal and plastic parts for " +
        "durability and appearance. Nickel options include semi-bright, bright, duplex and triplex.",
      useCount: 17,
    },
    {
      question: "What metal stripping chemicals are available for nickel?",
      answer:
        "A Nickel Stripper for copper and copper alloys, and a Nickel Stripper for mild steel.",
      useCount: 16,
    },
    {
      question: "How does Al Taher assist with product selection and compatibility?",
      answer:
        "We act as both consultant and supplier — advising on technical specifications such as " +
        "grit selection, material compatibility and machine compatibility for your application.",
      useCount: 7,
    },
    {
      question: "What is the process for pickling and passivating stainless steel?",
      answer:
        "Three stages: degrease with Toughclean K 200 or AC, pickle with Fintech 0416 or Pick and " +
        "Pass Liquid/Gel/Spray, then passivate with Pick and Pass P or a Weld Cleaning Machine. " +
        "Pickling uses acidic solutions — follow strict safety protocols.",
      useCount: 4,
    },
    {
      question: "Which industries does Al Taher serve?",
      answer:
        "Defence, aviation, marine maintenance, heavy machinery, fasteners, telecommunications, " +
        "automotive, electronics and interior decoration.",
      useCount: 9,
    },
  ];

  await prisma.faq.createMany({
    data: faqs.map((f) => ({ ...f, organizationId: org.id, sourceId: source.id })),
  });

  // ── Conversations ──────────────────────────────────────────────────────────
  // The first is the real transcript captured from the live account.

  const rajesh = await prisma.contact.create({
    data: {
      organizationId: org.id,
      name: "Rajesh K.",
      phone: "+919165865058",
      tags: ["chrome-plating", "hot-lead"],
      locale: "en",
    },
  });

  const convo1 = await prisma.conversation.create({
    data: {
      organizationId: org.id,
      contactId: rajesh.id,
      channelConnectionId: whatsapp.id,
      agentId: agent.id,
      state: ConversationState.HUMAN_ACTIVE,
      lastMessageAt: ago(18),
      totalCostUsd: 0.0042,
    },
  });

  const thread: [Direction, string, boolean, number][] = [
    [Direction.OUTBOUND, "Sorry we missed your call. How can we help? Reply here and we'll get back to you right away.", true, 64],
    [Direction.INBOUND, "What kind of service are you providing", false, 63],
    [Direction.OUTBOUND, "Hey, thanks for reaching out to Al Taher Chemicals. We supply industrial chemicals for metal finishing, electroplating, hot dip galvanizing and coatings, backed by over 20 years in the GCC", true, 62],
    [Direction.OUTBOUND, "What kind of project are you working on right now?", true, 62],
    [Direction.INBOUND, "Elegant", false, 61],
    [Direction.OUTBOUND, "Hey, sorry I want to make sure I follow you. Are you looking for an elegant decorative finish on your parts, like bright chrome or nickel?", true, 60],
    [Direction.INBOUND, "Yes yes", false, 59],
    [Direction.OUTBOUND, "Nice. Decorative finishes like bright chrome and nickel are right up our street. We've been doing this across the GCC for 20 years", true, 58],
    [Direction.INBOUND, "I am looking for Chrome plating in utensils that normally we are using in cooking. Also we need to check plating for car accessories", false, 40],
    [Direction.OUTBOUND, "Makes sense. Car accessories in bright or decorative chrome is very much in our wheelhouse. We offer conventional and catalytic bright chrome for that kind of finish", true, 22],
    [Direction.OUTBOUND, "The cookware side is a little different, since it's food-contact and I don't want to point you to the wrong chemistry there. For now, can you tell me what material the car accessory parts are made from?", true, 18],
  ];

  for (const [direction, body, ai, mins] of thread) {
    await prisma.message.create({
      data: {
        organizationId: org.id,
        conversationId: convo1.id,
        direction,
        body,
        aiGenerated: ai,
        model: ai ? "minimax-m3" : null,
        costUsd: ai ? 0.00038 : null,
        createdAt: ago(mins),
      },
    });
  }

  const sakshi = await prisma.contact.create({
    data: {
      organizationId: org.id,
      name: "Sakshi Giri",
      phone: "+919981979445",
      email: "sakshi.giri@example.com",
      tags: ["passivation"],
    },
  });

  const convo2 = await prisma.conversation.create({
    data: {
      organizationId: org.id,
      contactId: sakshi.id,
      channelConnectionId: whatsapp.id,
      agentId: agent.id,
      state: ConversationState.AI_ACTIVE,
      lastMessageAt: ago(95),
      totalCostUsd: 0.0019,
    },
  });

  for (const [direction, body, ai, mins] of [
    [Direction.INBOUND, "Do you supply passivation chemicals for stainless steel tanks?", false, 120],
    [Direction.OUTBOUND, "We do. For large fabricated structures and tanks where immersion isn't possible, Pickling Spray Semi Gel is usually the right call — it's formulated to cling to vertical surfaces", true, 118],
    [Direction.OUTBOUND, "What's the tank made of, and roughly what surface area are we talking about?", true, 117],
    [Direction.INBOUND, "316L, about 40 square metres", false, 96],
    [Direction.OUTBOUND, "Good, 316L passivates well. For 40 sq m I'd suggest a consultant walks you through quantities and the neutralisation step. Shall I set up a short call this week?", true, 95],
  ] as [Direction, string, boolean, number][]) {
    await prisma.message.create({
      data: {
        organizationId: org.id,
        conversationId: convo2.id,
        direction,
        body,
        aiGenerated: ai,
        model: ai ? "minimax-m3" : null,
        costUsd: ai ? 0.00041 : null,
        createdAt: ago(mins),
      },
    });
  }

  const webVisitor = await prisma.contact.create({
    data: { organizationId: org.id, name: null, tags: ["abrasives"] },
  });

  const convo3 = await prisma.conversation.create({
    data: {
      organizationId: org.id,
      contactId: webVisitor.id,
      channelConnectionId: widget.id,
      agentId: agent.id,
      state: ConversationState.AI_ACTIVE,
      lastMessageAt: ago(210),
      totalCostUsd: 0.0008,
    },
  });

  for (const [direction, body, ai, mins] of [
    [Direction.INBOUND, "which belt for deburring stainless", false, 214],
    [Direction.OUTBOUND, "For deburring stainless, start with a ceramic or zirconia belt in the 60–80 grit range, then move to surface conditioning to blend the scratch pattern", true, 212],
    [Direction.OUTBOUND, "Is this on flat sheet or on pipe?", true, 210],
  ] as [Direction, string, boolean, number][]) {
    await prisma.message.create({
      data: {
        organizationId: org.id,
        conversationId: convo3.id,
        direction,
        body,
        aiGenerated: ai,
        model: ai ? "minimax-m3" : null,
        costUsd: ai ? 0.00027 : null,
        createdAt: ago(mins),
      },
    });
  }

  await prisma.contact.createMany({
    data: [
      { organizationId: org.id, name: "Imran Sheikh", phone: "+971501234567", tags: ["galvanizing"] },
      { organizationId: org.id, name: "Priya Nair", email: "priya@example.com", tags: ["quote-sent"] },
      { organizationId: org.id, name: "Ahmed Al Balushi", phone: "+96891234567", tags: ["marine"] },
    ],
  });

  // A fortnight of usage so the dashboard chart has a shape.
  const usage = [];
  for (let d = 13; d >= 0; d--) {
    const calls = 3 + Math.floor(Math.random() * 12);
    for (let i = 0; i < calls; i++) {
      usage.push({
        organizationId: org.id,
        kind: "chat",
        model: "minimax-m3",
        promptTokens: 6800 + Math.floor(Math.random() * 1600),
        cachedTokens: 6000 + Math.floor(Math.random() * 800),
        outputTokens: 90 + Math.floor(Math.random() * 140),
        costUsd: 0.00026 + Math.random() * 0.0003,
        byok: false,
        createdAt: ago(d * 24 * 60 + Math.floor(Math.random() * 600)),
      });
    }
  }
  await prisma.usageRecord.createMany({ data: usage });

  await prisma.dataSource.create({
    data: {
      organizationId: org.id,
      name: "ATC product catalogue",
      kind: "POSTGRES",
      // Placeholder — a real one is encrypted via lib/crypto.ts
      configEnc: "not-configured",
      isActive: false,
      queries: {
        create: [
          {
            name: "check_stock",
            description:
              "Check current stock level for a product by its code. Use when a customer asks " +
              "whether something is available or how much is in stock.",
            parameters: {
              type: "object",
              properties: { productCode: { type: "string", description: "e.g. FIN-0416" } },
              required: ["productCode"],
            },
            statement: "SELECT code, name, qty_available, unit FROM products WHERE code = $1",
          },
        ],
      },
    },
  });

  console.log(`Seeded "${org.name}" — 1 agent, 4 channels, 3 conversations, ${faqs.length} FAQs, ${usage.length} usage records.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
