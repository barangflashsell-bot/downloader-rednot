import { extractRednote } from '../src/rednote/extractor';

async function main() {
  const targetUrl = process.argv[2];

  if (!targetUrl) {
    console.log('ℹ️ Live Extractor Test Utility');
    console.log('Gunakan script ini untuk menguji ekstraksi langsung dari URL publik Xiaohongshu / RedNote.');
    console.log('\nPenggunaan:');
    console.log('  npm run test:rednote:live <URL_REDNOTE>');
    console.log('\nContoh:');
    console.log('  npm run test:rednote:live https://www.xiaohongshu.com/explore/65a000000000000001000001');
    console.log('  npm run test:rednote:live https://xhslink.com/sampleCode');
    return;
  }

  console.log(`🚀 Menguji ekstraksi live untuk URL: ${targetUrl}`);

  try {
    const post = await extractRednote(targetUrl);
    console.log('\n✅ Ekstraksi Berhasil:');
    console.log(`• ID           : ${post.id || '(tidak ada)'}`);
    console.log(`• Judul        : ${post.title || '(tidak ada)'}`);
    console.log(`• Author       : ${post.author || '(tidak ada)'} (${post.authorId || '-'})`);
    console.log(`• Canonical URL: ${post.canonicalUrl}`);
    console.log(`• Total Media  : ${post.media.length}`);
    post.media.forEach((item, idx) => {
      console.log(`  [${idx + 1}] Type: ${item.type} | URL: ${item.url}`);
    });
  } catch (err: unknown) {
    console.error('\n❌ Ekstraksi Gagal:');
    console.error(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    process.exit(1);
  }
}

main();
