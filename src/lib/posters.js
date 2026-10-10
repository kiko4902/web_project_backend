// Posters are stored as tiny Amazon thumbnails (67px wide). Amazon's image
// server resizes on request: everything between "._V1_" and the extension is a
// transform, so it can be swapped for the width actually needed.
const AMAZON_TRANSFORM = /\._V1_[^/]*\.(jpg|jpeg|png)$/i;

const WIDTHS = {
  thumb: 300, // grid cards
  large: 600, // detail page
};

function posterUrl(url, size) {
  if (!url) return null;
  if (!url.includes('m.media-amazon.com') || !AMAZON_TRANSFORM.test(url)) return url;
  return url.replace(AMAZON_TRANSFORM, `._V1_QL75_UX${WIDTHS[size]}_.$1`);
}

// Replaces the raw poster_url with the two sizes the frontend uses.
function withPosters(movie) {
  const { poster_url: original, ...rest } = movie;
  return {
    ...rest,
    poster_thumb_url: posterUrl(original, 'thumb'),
    poster_large_url: posterUrl(original, 'large'),
  };
}

module.exports = { posterUrl, withPosters };
