import LandingPage from '../components/LandingPage';
import portal from '../data/portal.json';
import sites from '../data/sites.json';
import photos from '../data/photos.json';

export default function Home() {
  return <LandingPage portal={portal} sites={sites} photos={photos} />;
}
