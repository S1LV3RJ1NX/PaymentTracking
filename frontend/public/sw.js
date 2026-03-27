/* global self, URL, caches, Response */
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname === "/upload" && event.request.method === "POST") {
    event.respondWith(handleShareTarget(event.request));
    return;
  }
});

async function handleShareTarget(request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (file) {
    const cache = await caches.open("share-target");
    await cache.put(
      "shared-file",
      new Response(file, {
        headers: { "X-Filename": file.name, "Content-Type": file.type },
      }),
    );
  }

  return Response.redirect("/upload?shared=1", 303);
}
