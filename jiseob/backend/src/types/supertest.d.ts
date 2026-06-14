declare module 'supertest' {
  type SuperTestResponse = {
    body: unknown;
  };

  type SuperTestChain = Promise<SuperTestResponse> & {
    post(path: string): SuperTestChain;
    set(field: string, value: string): SuperTestChain;
    send(body: unknown): SuperTestChain;
    expect(status: number): SuperTestChain;
    expect(assertion: (response: SuperTestResponse) => void): SuperTestChain;
  };

  const request: (app: unknown) => SuperTestChain;

  export default request;
}
