import React from 'react';
import { Orbit, Sparkles, FolderOpen, Brain, Globe2, ListTree, Clock3, Search } from 'lucide-react';
import { siAirtable, siAlgolia, siArxiv, siAsana, siBrave, siClaude, siClickup, siCloudflare, siCoda, siConfluence, siContentful, siDatabricks, siDatadog, siDiscord, siDocker, siDropbox, siDuckduckgo, siElasticsearch, siEvernote, siFigma, siFirebase, siGit, siGithub, siGitlab, siGmail, siGoogleanalytics, siGooglecalendar, siGooglecloud, siGoogledocs, siGoogledrive, siGooglegemini, siGooglemaps, siGooglesearchconsole, siGooglesheets, siGrafana, siHubspot, siHuggingface, siIntercom, siJira, siKubernetes, siLangchain, siLinear, siMailchimp, siMiro, siMixpanel, siMongodb, siMysql, siN8n, siNeon, siNetlify, siNotion, siNpm, siObsidian, siOllama, siPagerduty, siPaypal, siPerplexity, siPostgresql, siPosthog, siPrisma, siPuppeteer, siPypi, siQdrant, siReddit, siRedis, siSanity, siSemrush, siSentry, siShopify, siSnowflake, siSpotify, siSqlite, siStrapi, siStripe, siSupabase, siTelegram, siTodoist, siTrello, siVercel, siWhatsapp, siWikipedia, siWordpress, siX, siYoutube, siZapier, siZendesk } from 'simple-icons';

const GLYPH_ICONS = { FolderOpen, Brain, Globe2, ListTree, Clock3, Search };
const BRANDS = [
  [/notion/i, siNotion],
  [/github|server-github|gh-mcp/i, siGithub],
  [/gitlab/i, siGitlab],
  [/(^|[^a-z])linear([^a-z]|$)/i, siLinear],
  [/google[-_ ]?drive|gdrive/i, siGoogledrive],
  [/gmail/i, siGmail],
  [/google[-_ ]?calendar|gcal/i, siGooglecalendar],
  [/google[-_ ]?sheets/i, siGooglesheets],
  [/google[-_ ]?docs/i, siGoogledocs],
  [/google[-_ ]?maps/i, siGooglemaps],
  [/search[-_ ]?console|gsc/i, siGooglesearchconsole],
  [/analytics|ga4/i, siGoogleanalytics],
  [/gemini/i, siGooglegemini],
  [/google[-_ ]?cloud|gcp/i, siGooglecloud],
  [/figma/i, siFigma],
  [/stripe/i, siStripe],
  [/supabase/i, siSupabase],
  [/vercel/i, siVercel],
  [/sentry/i, siSentry],
  [/confluence/i, siConfluence],
  [/jira|atlassian/i, siJira],
  [/asana/i, siAsana],
  [/airtable/i, siAirtable],
  [/miro/i, siMiro],
  [/zapier/i, siZapier],
  [/cloudflare/i, siCloudflare],
  [/postgres|psql/i, siPostgresql],
  [/sqlite/i, siSqlite],
  [/puppeteer/i, siPuppeteer],
  [/docker/i, siDocker],
  [/kubernetes|k8s/i, siKubernetes],
  [/mongo/i, siMongodb],
  [/redis/i, siRedis],
  [/mysql/i, siMysql],
  [/shopify/i, siShopify],
  [/hubspot/i, siHubspot],
  [/trello/i, siTrello],
  [/anthropic|claude/i, siClaude],
  [/perplexity/i, siPerplexity],
  [/hugging/i, siHuggingface],
  [/discord/i, siDiscord],
  [/telegram/i, siTelegram],
  [/whatsapp/i, siWhatsapp],
  [/twitter|(^|[^a-z])x\.com/i, siX],
  [/youtube/i, siYoutube],
  [/reddit/i, siReddit],
  [/spotify/i, siSpotify],
  [/dropbox/i, siDropbox],
  [/npm/i, siNpm],
  [/pypi/i, siPypi],
  [/datadog/i, siDatadog],
  [/grafana/i, siGrafana],
  [/netlify/i, siNetlify],
  [/firebase/i, siFirebase],
  [/elastic/i, siElasticsearch],
  [/snowflake/i, siSnowflake],
  [/databricks/i, siDatabricks],
  [/n8n/i, siN8n],
  [/intercom/i, siIntercom],
  [/zendesk/i, siZendesk],
  [/wordpress/i, siWordpress],
  [/semrush/i, siSemrush],
  [/brave/i, siBrave],
  [/duckduckgo/i, siDuckduckgo],
  [/wikipedia/i, siWikipedia],
  [/arxiv/i, siArxiv],
  [/obsidian/i, siObsidian],
  [/todoist/i, siTodoist],
  [/evernote/i, siEvernote],
  [/clickup/i, siClickup],
  [/coda/i, siCoda],
  [/mailchimp/i, siMailchimp],
  [/paypal/i, siPaypal],
  [/neon/i, siNeon],
  [/prisma/i, siPrisma],
  [/sanity/i, siSanity],
  [/contentful/i, siContentful],
  [/strapi/i, siStrapi],
  [/algolia/i, siAlgolia],
  [/mixpanel/i, siMixpanel],
  [/posthog/i, siPosthog],
  [/pagerduty/i, siPagerduty],
  [/ollama/i, siOllama],
  [/langchain/i, siLangchain],
  [/qdrant/i, siQdrant],
  [/(^|[^a-z])git([^a-z]|$)/i, siGit]
];
const TILES = [
  [/slack/i, '4A154B', 'S'],
  [/canva/i, '00C4CC', 'C'],
  [/playwright/i, '2EAD33', 'P'],
  [/openai|chatgpt/i, '10A37F', 'O'],
  [/aws|amazon/i, 'FF9900', 'A'],
  [/azure/i, '0078D4', 'A'],
  [/salesforce/i, '00A1E0', 'S'],
  [/twilio/i, 'F22F46', 'T'],
  [/pinecone/i, '1C17FF', 'P'],
  [/ahrefs/i, 'FF7A00', 'A'],
  [/rea-agents|(^|[^a-z])rea([^a-z]|$)/i, '6D5BD0', 'R']
];
const GLYPHS = [
  [/filesystem|file-?server/i, 'FolderOpen'],
  [/memory/i, 'Brain'],
  [/fetch|http-?request|browser/i, 'Globe2'],
  [/sequential|thinking/i, 'ListTree'],
  [/(^|[^a-z])time([^a-z]|$)/i, 'Clock3'],
  [/search/i, 'Search']
];

const luminance = hex => { const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * b; };
const hue = text => { let h = 0; for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

// Which service an MCP server belongs to, worked out from its name and what it runs or connects to.
export function serverBrand(tool) {
  const text = `${tool.name || ''} ${tool.detail || ''}`.toLowerCase();
  for (const [pattern, icon] of BRANDS) if (pattern.test(text)) return { type: 'icon', icon };
  for (const [pattern, hex, letter] of TILES) if (pattern.test(text)) return { type: 'tile', hex, letter };
  for (const [pattern, glyph] of GLYPHS) if (pattern.test(text)) return { type: 'glyph', glyph };
  return { type: 'mono', hue: hue(tool.name || '?'), letter: (tool.name || '?').replace(/^claude[_ ]ai[_ ]/i, '').slice(0, 1).toUpperCase() };
}

export function ServerIcon({ tool, size = 24 }) {
  const frame = { width: size, height: size, borderRadius: Math.round(size * .3) };
  if (tool.kind === 'builtin') return <span className="server-icon" style={{ ...frame, '--tint': 'var(--accent)' }} title="Built in"><Orbit size={size * .6}/></span>;
  if (tool.kind === 'custom') return <span className="server-icon" style={{ ...frame, '--tint': 'var(--accent)' }} title="Custom tool"><Sparkles size={size * .6}/></span>;
  const brand = serverBrand(tool);
  if (tool.icon && brand.type === 'mono') return <span className="server-icon logo" style={{ ...frame, background: '#fff' }} title={tool.name}><img src={tool.icon} alt="" width={size * .72} height={size * .72} style={{ objectFit: 'contain', borderRadius: Math.round(size * .12) }}/></span>;
  if (brand.type === 'icon') {
    const dark = luminance(brand.icon.hex) < .22, glyph = dark ? 'currentColor' : `#${brand.icon.hex}`;
    return <span className="server-icon" style={{ ...frame, '--tint': `#${brand.icon.hex}` }} title={brand.icon.title}><svg viewBox="0 0 24 24" width={size * .62} height={size * .62} role="img" aria-label={brand.icon.title}><path d={brand.icon.path} fill={glyph}/></svg></span>;
  }
  if (brand.type === 'tile') return <span className="server-icon tile" style={{ ...frame, background: `#${brand.hex}`, fontSize: size * .5 }} title={tool.name}>{brand.letter}</span>;
  if (brand.type === 'glyph') { const Glyph = GLYPH_ICONS[brand.glyph]; return <span className="server-icon" style={{ ...frame, '--tint': 'var(--accent)' }} title={tool.name}><Glyph size={size * .6}/></span>; }
  return <span className="server-icon tile" style={{ ...frame, background: `hsl(${brand.hue} 45% 42%)`, fontSize: size * .5 }} title={tool.name}>{brand.letter}</span>;
}
