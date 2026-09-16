import { Layout } from './components/Layout';
import { ReferenceDemo } from './components/ReferenceDemo';

export function App() {
  return (
    <Layout>
      {new URLSearchParams(window.location.search).get('demo') === 'references' ? (
        <ReferenceDemo />
      ) : (
        <p>项目骨架已就绪。功能页面由对应 Issue 认领后实现。</p>
      )}
    </Layout>
  );
}
