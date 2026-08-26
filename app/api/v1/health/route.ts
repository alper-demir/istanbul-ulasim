export async function GET() {
  return Response.json({
    status: 'ok',
    service: 'istanbulum-web',
    time: new Date().toISOString(),
  });
}
